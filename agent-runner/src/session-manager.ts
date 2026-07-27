import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Settings } from "./config.js";
import type { RunControl, WorkerDone } from "./job-types.js";
import { WorkerPool } from "./worker-pool.js";

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
      throw new ActiveRunError(agentId);
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
  private started = false;

  constructor(settings: Settings, pool?: RunPool) {
    this.settings = settings;
    this.pool = pool ?? createDefaultPool(settings);
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
            return {
              agentId: existingId,
              runs: [{ runId: "", status: "skipped_active_run" }],
            };
          }
          throw error;
        }
      }
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
      void submitted.done
        .then((done) => {
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
      throw new ActiveRunError(agentId);
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
      void submitted.done
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
        })
        .finally(() => {
          this.busyAgents.delete(agentId);
        });
      return { runId: submitted.runId, status: "accepted" };
    } catch (error) {
      this.busyAgents.delete(agentId);
      throw mapPoolError(error, agentId);
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
    return new ActiveRunError(agentId ?? "unknown");
  }
  return error;
}

export class ActiveRunError extends Error {
  constructor(agentId: string) {
    super(`Agent ${agentId} already has active run`);
    this.name = "ActiveRunError";
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
