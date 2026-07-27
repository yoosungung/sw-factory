import { randomUUID } from "node:crypto";

import type { Context, Next } from "hono";
import { Hono } from "hono";

import type { Settings } from "./config.js";
import { loadSettings } from "./config.js";
import { parseRunControl } from "./run-policy.js";
import type { AgentBackend } from "./session-manager.js";
import { buildBackend, ActiveRunError, SessionNotFoundError } from "./session-manager.js";

function log(event: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...fields,
    }),
  );
}

const ticketLocks = new Set<number>();

type AppVariables = {
  requestId: string;
};

export function createApp(
  settings: Settings = loadSettings(),
  backend: AgentBackend = buildBackend(settings),
) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c: Context, next: Next) => {
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    c.set("requestId", requestId);
    await next();
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.post("/sessions", async (c) => {
    const requestId = c.get("requestId");
    const body = await c.req.json<{
      prompt: string;
      ticket_id?: number;
      budget?: { max_turns?: number; timeout_ms?: number };
      policy?: { tool_classes?: string[]; deny?: string[] };
      context_summary?: string;
      success_checks?: string[];
      success_retry?: { max_attempts?: number };
    }>();
    const control = parseRunControl(body);
    log("session.create", {
      requestId,
      ticket_id: body.ticket_id,
      ...(control?.budget?.max_turns !== undefined
        ? { budget_max_turns: control.budget.max_turns }
        : {}),
    });
    const session = await backend.create(body.prompt, body.ticket_id, control);
    return c.json({ agent_id: session.agentId }, 201);
  });

  app.post("/sessions/:agentId/prompt", async (c) => {
    const requestId = c.get("requestId");
    const agentId = c.req.param("agentId");
    const body = await c.req.json<{
      prompt: string;
      event?: string;
      ticket_id?: number;
      budget?: { max_turns?: number; timeout_ms?: number };
      policy?: { tool_classes?: string[]; deny?: string[] };
      context_summary?: string;
      success_checks?: string[];
      success_retry?: { max_attempts?: number };
    }>();
    const control = parseRunControl(body);

    if (body.ticket_id !== undefined && ticketLocks.has(body.ticket_id)) {
      log("session.prompt.skipped", {
        requestId,
        agent_id: agentId,
        ticket_id: body.ticket_id,
        reason: "mutex",
      });
      return c.json({ run_id: "", status: "skipped_mutex" }, 409);
    }

    if (body.ticket_id !== undefined) {
      ticketLocks.add(body.ticket_id);
    }

    try {
      const run = await backend.prompt(
        agentId,
        body.prompt,
        body.event,
        body.ticket_id,
        control,
      );
      log("session.prompt", {
        requestId,
        agent_id: agentId,
        ticket_id: body.ticket_id,
        run_id: run.runId,
        status: run.status,
        ...(control?.budget?.max_turns !== undefined
          ? { budget_max_turns: control.budget.max_turns }
          : {}),
      });
      return c.json({ run_id: run.runId, status: run.status }, 202);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return c.json({ detail: "session not found" }, 404);
      }
      if (error instanceof ActiveRunError) {
        log("session.prompt.skipped", {
          requestId,
          agent_id: agentId,
          ticket_id: body.ticket_id,
          reason: "active_run",
        });
        return c.json({ run_id: "", status: "skipped_active_run" }, 409);
      }
      throw error;
    } finally {
      if (body.ticket_id !== undefined) {
        ticketLocks.delete(body.ticket_id);
      }
    }
  });

  app.delete("/sessions/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    await backend.cancel(agentId);
    return c.body(null, 204);
  });

  app.get("/spike/report", (c) => {
    const report = backend.spikeReport();
    return c.json({
      sessions: report.sessions,
      total_runs: report.totalRuns,
    });
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    if (error instanceof SessionNotFoundError) {
      return c.json({ detail: "session not found" }, 404);
    }
    if (error instanceof ActiveRunError) {
      return c.json({ run_id: "", status: "skipped_active_run" }, 409);
    }
    const message = error instanceof Error ? error.message : String(error);
    log("request.error", { requestId, error: message });
    return c.json({ detail: message }, 500);
  });

  return app;
}
