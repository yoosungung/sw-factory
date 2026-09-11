import { Hono } from "hono";
import { ConcurrencyGuard } from "./concurrency";
import { ensurePersonaWorkspace } from "./pvc";
import { WorkerPool } from "./pool";
import { Recover } from "./recover";
import { SessionMap } from "./session-map";
import type {
  CreateSessionBody,
  PromptBody,
  RunnerSettings,
  SdkBackend,
  SessionRecord,
} from "./types";

export type RunnerApp = {
  app: Hono;
  sessions: SessionMap;
  recover: Recover;
  pool: WorkerPool;
  guard: ConcurrencyGuard;
};

export function createRunner(opts: {
  settings: RunnerSettings;
  backend: SdkBackend;
}): RunnerApp {
  const sessions = new SessionMap();
  const guard = new ConcurrencyGuard(
    opts.settings.maxActivePerPersona,
    opts.settings.maxQueuePerPersona,
    opts.settings.createThrottleMs,
  );
  const pool = new WorkerPool(opts.settings.poolSize, opts.backend);
  const recover = new Recover(sessions, opts.backend, opts.settings.activeRunSkipLimit);
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/readyz", (c) => c.json({ ok: true }));

  app.post("/sessions", async (c) => {
    const body = await c.req.json<CreateSessionBody>();
    if (!body.persona || !body.prompt) {
      return c.json({ error: "invalid_input" }, 400);
    }
    const ticketId = body.ticket_id ?? null;
    if (!guard.checkCreateThrottle(ticketId)) {
      return c.json({ status: "create_throttled" }, 429);
    }
    if (!guard.tryAcquireTicket(ticketId)) {
      return c.json({ status: "skipped_mutex" }, 409);
    }
    const personaGate = guard.tryEnqueuePersona(body.persona);
    if (personaGate === "queue_full") {
      guard.releaseTicket(ticketId);
      return c.json({ status: "skipped_mutex" }, 409);
    }
    if (personaGate === "active_full") {
      guard.releaseTicket(ticketId);
      guard.releasePersona(body.persona, true);
      return c.json({ status: "skipped_active_run", reason: "busy" }, 409);
    }

    try {
      const cwd = await ensurePersonaWorkspace(opts.settings.dataDir, body.persona);
      const created = await opts.backend.create({
        persona: body.persona,
        cwd,
        prompt: body.prompt,
      });
      const record: SessionRecord = {
        agentId: created.agentId,
        persona: body.persona,
        ticketId,
        cwd,
        activeRun: true,
        skipCount: 0,
        createdAt: new Date().toISOString(),
      };
      sessions.set(record);

      // fire-and-forget first prompt via pool
      void (async () => {
        try {
          await opts.backend.send({
            agentId: record.agentId,
            prompt: body.prompt,
            cwd,
          });
        } catch (err) {
          await recover.onActiveRunFail(
            record.agentId,
            err instanceof Error ? err.message : "send_failed",
          );
        } finally {
          const rec = sessions.get(record.agentId);
          if (rec) {
            rec.activeRun = false;
            sessions.set(rec);
          }
          guard.releaseTicket(ticketId);
          guard.releasePersona(body.persona);
        }
      })();

      return c.json({ agent_id: created.agentId }, 200);
    } catch (err) {
      guard.releaseTicket(ticketId);
      guard.releasePersona(body.persona);
      return c.json(
        { error: "create_failed", detail: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  app.post("/sessions/:agentId/prompt", async (c) => {
    const agentId = c.req.param("agentId");
    const body = await c.req.json<PromptBody>();
    const rec = sessions.get(agentId);
    if (!rec) return c.json({ error: "not_found" }, 404);

    if (rec.activeRun) {
      const reason = recover.onSkippedBusy(agentId);
      return c.json({ status: "skipped_active_run", reason }, 409);
    }

    const ticketId = body.ticket_id ?? rec.ticketId;
    if (!guard.tryAcquireTicket(ticketId)) {
      return c.json({ status: "skipped_mutex" }, 409);
    }
    const personaGate = guard.tryEnqueuePersona(rec.persona);
    if (personaGate !== "ok") {
      guard.releaseTicket(ticketId);
      if (personaGate === "active_full") {
        guard.releasePersona(rec.persona, true);
        return c.json({ status: "skipped_active_run", reason: "busy" }, 409);
      }
      return c.json({ status: "skipped_mutex" }, 409);
    }

    rec.activeRun = true;
    rec.skipCount = 0;
    if (ticketId) rec.ticketId = ticketId;
    sessions.set(rec);

    const runId = `run-${Date.now()}`;
    void (async () => {
      try {
        await opts.backend.send({
          agentId,
          prompt: body.prompt,
          cwd: rec.cwd,
        });
      } catch (err) {
        await recover.onActiveRunFail(
          agentId,
          err instanceof Error ? err.message : "send_failed",
        );
      } finally {
        const latest = sessions.get(agentId);
        if (latest) {
          latest.activeRun = false;
          sessions.set(latest);
        }
        guard.releaseTicket(ticketId);
        guard.releasePersona(rec.persona);
      }
    })();

    return c.json({ run_id: runId, status: "accepted" }, 202);
  });

  app.delete("/sessions/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const rec = sessions.get(agentId);
    if (rec) {
      await opts.backend.close?.(agentId);
      sessions.delete(agentId);
    }
    return c.body(null, 204);
  });

  return { app, sessions, recover, pool, guard };
}
