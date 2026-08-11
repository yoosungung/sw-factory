import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Settings } from "./config.js";
import { CreateStormGuard, CreateThrottledError } from "./create-storm.js";
import type { RunControl, WorkerDone } from "./job-types.js";
import { WorkerPool } from "./worker-pool.js";

export { CreateThrottledError } from "./create-storm.js";

/** Consecutive skipped_active_run before cancel+recreate (R3). */
export const SKIPPED_ACTIVE_RUN_THRESHOLD = 2;

export interface RunResult {
  runId: string;
  status: string;
}

export interface AgentSession {
  agentId: string;
  ticketId?: number;
  runs: RunResult[];
}

export interface AgentBackend {
  create(
    prompt: string,
    ticketId?: number,
    control?: RunControl,
  ): Promise<AgentSession>;
  prompt(
    agentId: string,
    prompt: string,
    event?: string,
    ticketId?: number,
    control?: RunControl,
  ): Promise<RunResult>;
  cancel(agentId: string): Promise<void>;
  spikeReport(): { sessions: number; totalRuns: number };
  close?(): Promise<void>;
}

/** Narrow pool surface for tests. */
export interface RunPool {
  start(): Promise<void>;
  close(): Promise<void>;
  submit(job: {
    type: "create" | "prompt";
    prompt: string;
    agentId?: string;
    ticketId?: number;
    event?: string;
    model: string;
    workspace: string;
    control?: RunControl;
  }): Promise<{ agentId: string; runId: string; done: Promise<WorkerDone> }>;
  delete(agentId: string, workspace: string, model: string): Promise<void>;
}

export class MockBackend implements AgentBackend {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly ticketAgents = new Map<number, string>();
  private readonly busyAgents = new Set<string>();

  async create(
    prompt: string,
    ticketId?: number,
    control?: RunControl,
  ): Promise<AgentSession> {
    if (ticketId !== undefined) {
      const existingId = this.ticketAgents.get(ticketId);
      if (existingId !== undefined && this.sessions.has(existingId)) {
        const run = await this.prompt(
          existingId,
          prompt,
          undefined,
          ticketId,
          control,
        );
        const session = this.sessions.get(existingId);
        if (!session) {
          throw new SessionNotFoundError(existingId);
        }
        return session;
      }
    }

    void prompt;
    void control;
    const agentId = `mock-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const session: AgentSession = {
      agentId,
      ticketId,
      runs: [{ runId: `run-${randomUUID().slice(0, 8)}`, status: "completed" }],
    };
    this.sessions.set(agentId, session);
    if (ticketId !== undefined) {
      this.ticketAgents.set(ticketId, agentId);
    }
    return session;
  }

  async prompt(
    agentId: string,
    prompt: string,
    event?: string,
    ticketId?: number,
    control?: RunControl,
  ): Promise<RunResult> {
    void prompt;
    void event;
    void ticketId;
    void control;
    if (this.busyAgents.has(agentId)) {
      throw new ActiveRunError(agentId, "busy");
    }
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new SessionNotFoundError(agentId);
    }
    const run: RunResult = {
      runId: `run-${randomUUID().slice(0, 8)}`,
      status: "accepted",
    };
    session.runs.push(run);
    return run;
  }

  markAgentBusy(agentId: string): void {
    this.busyAgents.add(agentId);
  }

  async cancel(agentId: string): Promise<void> {
    this.sessions.delete(agentId);
  }

  spikeReport(): { sessions: number; totalRuns: number } {
    let totalRuns = 0;
    for (const session of this.sessions.values()) {
      totalRuns += session.runs.length;
    }
    return { sessions: this.sessions.size, totalRuns };
  }
}

export class SdkBackend implements AgentBackend {
  private readonly settings: Settings;
  private readonly pool: RunPool;
  private readonly ticketAgents = new Map<number, string>();
  private readonly knownAgents = new Set<string>();
  private readonly busyAgents = new Set<string>();
  private readonly skippedActiveRunCounts = new Map<string, number>();
  private readonly createStorm: CreateStormGuard;
  private readonly skippedActiveRunThreshold: number;
  private started = false;

  constructor(
    settings: Settings,
    pool?: RunPool,
    createStorm?: CreateStormGuard,
    skippedActiveRunThreshold: number = SKIPPED_ACTIVE_RUN_THRESHOLD,
  ) {
    this.settings = settings;
    this.pool = pool ?? createDefaultPool(settings);
    this.createStorm = createStorm ?? new CreateStormGuard();
    this.skippedActiveRunThreshold = skippedActiveRunThreshold;
  }

  /** Drop sticky ticket→agent mapping so the next create gets a fresh MCP host. */
  forgetTicketAgent(ticketId: number): void {
    const agentId = this.ticketAgents.get(ticketId);
    if (agentId !== undefined) {
      this.ticketAgents.delete(ticketId);
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "mcp.sticky_reset",
          ticket_id: ticketId,
          agent_id: agentId,
        }),
      );
    }
  }

  private logRecover(fields: {
    reason: string;
    agent_id: string;
    ticket_id?: number;
    action: "forget" | "cancel" | "recreate";
  }): void {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "session.recover",
        ...fields,
      }),
    );
  }

  /** Forget ticket↔agent mapping and clear busy for agent (R1/R2). */
  private forgetAgentMapping(
    agentId: string,
    ticketId: number | undefined,
    reason: string,
  ): void {
    this.busyAgents.delete(agentId);
    if (ticketId !== undefined) {
      if (this.ticketAgents.get(ticketId) === agentId) {
        this.ticketAgents.delete(ticketId);
        this.createStorm.clear(ticketId);
      }
    } else {
      for (const [tid, mapped] of [...this.ticketAgents]) {
        if (mapped === agentId) {
          this.ticketAgents.delete(tid);
          this.createStorm.clear(tid);
        }
      }
    }
    this.logRecover({
      reason,
      agent_id: agentId,
      ticket_id: ticketId,
      action: "forget",
    });
  }

  private async cancelAndForget(
    agentId: string,
    ticketId: number | undefined,
    reason: string,
  ): Promise<void> {
    try {
      await this.cancel(agentId);
      this.logRecover({
        reason,
        agent_id: agentId,
        ticket_id: ticketId,
        action: "cancel",
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "session.cancel.failed",
          reason,
          agent_id: agentId,
          ticket_id: ticketId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      this.forgetAgentMapping(agentId, ticketId, reason);
    }
    this.skippedActiveRunCounts.delete(agentId);
  }

  /**
   * R3: count consecutive skipped_active_run. At threshold → cancel (R3) so
   * caller can recreate (R4). Returns true when mapping was cleared for recreate.
   */
  private async noteSkippedActiveRun(
    agentId: string,
    ticketId?: number,
  ): Promise<boolean> {
    const next = (this.skippedActiveRunCounts.get(agentId) ?? 0) + 1;
    this.skippedActiveRunCounts.set(agentId, next);
    if (next < this.skippedActiveRunThreshold) {
      return false;
    }
    await this.cancelAndForget(agentId, ticketId, "skipped_active_run");
    return true;
  }

  private recoverDoneFailure(
    agentId: string,
    ticketId: number | undefined,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.includes("exited during job")
      ? "worker_crash"
      : "done_reject";
    // Best-effort SDK cancelRun+delete (via pool.delete) so zombie active_run
    // does not survive after worker crash; falls back to local forget.
    void this.cancelAndForget(agentId, ticketId, reason);
  }

  async ensureStarted(): Promise<void> {
    if (this.started) {
      return;
    }
    await this.pool.start();
    this.started = true;
  }

  async close(): Promise<void> {
    await this.pool.close();
    this.started = false;
  }

  async create(
    prompt: string,
    ticketId?: number,
    control?: RunControl,
  ): Promise<AgentSession> {
    await this.ensureStarted();
    if (ticketId !== undefined) {
      const existingId = this.ticketAgents.get(ticketId);
      if (existingId !== undefined) {
        try {
          const run = await this.prompt(
            existingId,
            prompt,
            undefined,
            ticketId,
            control,
          );
          return { agentId: existingId, runs: [run] };
        } catch (error) {
          if (error instanceof ActiveRunError) {
            const cleared = await this.noteSkippedActiveRun(
              existingId,
              ticketId,
            );
            if (!cleared) {
              return {
                agentId: existingId,
                runs: [{ runId: "", status: "skipped_active_run" }],
              };
            }
            // R4: fall through to fresh create after cancel
            this.logRecover({
              reason: "skipped_active_run",
              agent_id: existingId,
              ticket_id: ticketId,
              action: "recreate",
            });
          } else {
            // Stale mapping — fall through to a fresh create.
            this.ticketAgents.delete(ticketId);
          }
        }
      }
      this.createStorm.beforeCreate(ticketId);
    }

    try {
      const submitted = await this.pool.submit({
        type: "create",
        prompt,
        ticketId,
        model: this.settings.model,
        workspace: this.settings.workspace,
        control,
      });
      this.knownAgents.add(submitted.agentId);
      if (ticketId !== undefined) {
        this.ticketAgents.set(ticketId, submitted.agentId);
      }
      this.busyAgents.add(submitted.agentId);
      this.skippedActiveRunCounts.delete(submitted.agentId);
      void submitted.done
        .then((done) => {
          if (ticketId !== undefined) {
            this.createStorm.markProgress(ticketId);
          }
          this.onWorkerDone(done, ticketId);
          if (done.status === "error") {
            console.error(
              JSON.stringify({
                ts: new Date().toISOString(),
                event: "session.create.completed",
                agent_id: done.agentId,
                ticket_id: ticketId,
                run_id: done.runId,
                status: done.status,
                error: done.error,
              }),
            );
          } else {
            console.log(
              JSON.stringify({
                ts: new Date().toISOString(),
                event: "session.create.completed",
                agent_id: done.agentId,
                ticket_id: ticketId,
                run_id: done.runId,
                status: done.status,
              }),
            );
          }
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "session.create.failed",
              ticket_id: ticketId,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          this.recoverDoneFailure(submitted.agentId, ticketId, error);
        })
        .finally(() => {
          this.busyAgents.delete(submitted.agentId);
        });

      return {
        agentId: submitted.agentId,
        ticketId,
        runs: [{ runId: submitted.runId, status: "accepted" }],
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "session.create.failed",
          ticket_id: ticketId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw mapPoolError(error);
    }
  }

  async prompt(
    agentId: string,
    prompt: string,
    event?: string,
    ticketId?: number,
    control?: RunControl,
  ): Promise<RunResult> {
    await this.ensureStarted();
    if (this.busyAgents.has(agentId)) {
      throw new ActiveRunError(agentId, "busy");
    }
    this.busyAgents.add(agentId);
    try {
      const submitted = await this.pool.submit({
        type: "prompt",
        agentId,
        prompt,
        ticketId,
        event,
        model: this.settings.model,
        workspace: this.settings.workspace,
        control,
      });
      this.knownAgents.add(submitted.agentId);
      this.skippedActiveRunCounts.delete(agentId);
      void submitted.done
        .then((done) => {
          if (ticketId !== undefined) {
            this.createStorm.markProgress(ticketId);
          }
          this.onWorkerDone(done, ticketId);
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "run.background.failed",
              agent_id: agentId,
              ticket_id: ticketId,
              run_id: submitted.runId,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          this.recoverDoneFailure(agentId, ticketId, error);
        })
        .finally(() => {
          this.busyAgents.delete(agentId);
        });
      return { runId: submitted.runId, status: "accepted" };
    } catch (error) {
      this.busyAgents.delete(agentId);
      const mapped = mapPoolError(error, agentId);
      if (mapped instanceof ActiveRunError) {
        // R2: SDK zombie active_run — forget + best-effort cancel
        await this.cancelAndForget(agentId, ticketId, "active_run_fail");
      }
      throw mapped;
    }
  }

  private onWorkerDone(done: WorkerDone, ticketId?: number): void {
    const id = done.ticketId ?? ticketId;
    if (id === undefined) {
      return;
    }
    if (done.mcpStickyReset) {
      this.forgetTicketAgent(id);
    }
  }

  async cancel(agentId: string): Promise<void> {
    await this.ensureStarted();
    try {
      await this.pool.delete(
        agentId,
        this.settings.workspace,
        this.settings.model,
      );
    } catch (error) {
      throw mapPoolError(error, agentId);
    }
    this.knownAgents.delete(agentId);
    this.busyAgents.delete(agentId);
    this.skippedActiveRunCounts.delete(agentId);
    for (const [ticketId, mapped] of this.ticketAgents) {
      if (mapped === agentId) {
        this.ticketAgents.delete(ticketId);
        this.createStorm.clear(ticketId);
      }
    }
  }

  spikeReport(): { sessions: number; totalRuns: number } {
    return { sessions: this.knownAgents.size, totalRuns: 0 };
  }
}

function mapPoolError(error: unknown, agentId?: string): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }
  const code = (error as Error & { code?: string }).code;
  if (code === "not_found" || error.message.toLowerCase().includes("not found")) {
    return new SessionNotFoundError(agentId ?? "unknown");
  }
  if (
    code === "active_run" ||
    error.message.includes("already has active run")
  ) {
    return new ActiveRunError(agentId ?? "unknown", "sdk_zombie");
  }
  return error;
}

export type ActiveRunReason = "busy" | "sdk_zombie";

export class ActiveRunError extends Error {
  readonly reason: ActiveRunReason;

  constructor(agentId: string, reason: ActiveRunReason = "busy") {
    super(`Agent ${agentId} already has active run`);
    this.name = "ActiveRunError";
    this.reason = reason;
  }
}

export class SessionNotFoundError extends Error {
  constructor(agentId: string) {
    super(`session not found: ${agentId}`);
    this.name = "SessionNotFoundError";
  }
}

function createDefaultPool(settings: Settings): WorkerPool {
  const jsWorker = fileURLToPath(
    new URL("./worker/main.js", import.meta.url),
  );
  const tsWorker = fileURLToPath(
    new URL("./worker/main.ts", import.meta.url),
  );
  // Prefer compiled JS; fall back to ts path only when present (tsx/dev).
  const workerScript = existsSync(jsWorker) ? jsWorker : tsWorker;

  return new WorkerPool({
    size: Math.max(1, settings.poolSize),
    idleMs: settings.workerIdleMs,
    maxAgeMs: settings.workerMaxAgeMs,
    maxJobs: settings.workerMaxJobs,
    workerScript,
    env: {
      CURSOR_API_KEY: settings.apiKey,
      AGENT_RUNNER_MODEL: settings.model,
      WORKSPACE: settings.workspace,
    },
  });
}

export function buildBackend(settings: Settings): AgentBackend {
  if (settings.mock) {
    return new MockBackend();
  }
  if (!settings.apiKey) {
    throw new Error("CURSOR_API_KEY is required when AGENT_RUNNER_MOCK!=1");
  }
  return new SdkBackend(settings);
}
