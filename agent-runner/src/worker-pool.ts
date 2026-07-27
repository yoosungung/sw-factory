import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type {
  CreateJob,
  PromptJob,
  WorkerAccepted,
  WorkerDone,
  WorkerFailed,
  WorkerJob,
  WorkerMessage,
} from "./job-types.js";
import { doneLooksAuthStale } from "./stale-auth.js";

export interface PoolOptions {
  size: number;
  idleMs: number;
  maxAgeMs: number;
  maxJobs: number;
  workerScript?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  retireBackoffMs?: number;
}

export interface SubmittedRun {
  agentId: string;
  runId: string;
  done: Promise<WorkerDone>;
}

type RunJob = Omit<CreateJob, "requestId"> | Omit<PromptJob, "requestId">;

interface WorkerSlot {
  id: string;
  child: ChildProcess;
  bornAt: number;
  lastJobAt: number;
  jobsCompleted: number;
  busy: boolean;
  ready: boolean;
}

function defaultWorkerScript(): string {
  return fileURLToPath(new URL("./worker/main.js", import.meta.url));
}

function log(event: string, fields: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...fields,
    }),
  );
}

export class WorkerPool {
  private readonly options: PoolOptions & { retireBackoffMs: number };
  private readonly workers: WorkerSlot[] = [];
  private readonly waiters: Array<() => void> = [];
  private closed = false;
  private lastRetireAt = 0;
  private readonly now: () => number;

  constructor(options: PoolOptions) {
    this.options = {
      retireBackoffMs: 200,
      ...options,
    };
    this.now = options.now ?? Date.now;
  }

  async start(): Promise<void> {
    await Promise.all(
      Array.from({ length: this.options.size }, () => this.spawnWorker()),
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map((w) => this.killWorker(w)));
    this.workers.length = 0;
  }

  async submit(job: RunJob): Promise<SubmittedRun> {
    return this.submitInternal(job, false);
  }

  async delete(
    agentId: string,
    workspace: string,
    model: string,
  ): Promise<void> {
    const worker = await this.lease();
    const requestId = randomUUID();
    try {
      const msg = await this.dispatchUntil(
        worker,
        {
          requestId,
          type: "delete",
          agentId,
          workspace,
          model,
        },
        ["deleted", "failed"],
      );
      if (msg.phase === "failed") {
        throw new Error(msg.error);
      }
    } finally {
      this.release(worker);
    }
  }

  private async submitInternal(
    job: RunJob,
    authRetried: boolean,
  ): Promise<SubmittedRun> {
    const worker = await this.lease();
    const requestId = randomUUID();
    const fullJob = { ...job, requestId } as WorkerJob;

    try {
      const outcome = await this.dispatchRun(worker, fullJob);

      if (outcome.kind === "failed") {
        this.release(worker);
        if (!authRetried && outcome.failed.code === "auth") {
          log("worker.auth_stale.retry", {
            worker_id: worker.id,
            phase: "send",
            error: outcome.failed.error,
          });
          await this.retire(worker, "auth");
          return this.submitInternal(job, true);
        }
        throw failedToError(outcome.failed);
      }

      worker.jobsCompleted += 1;
      worker.lastJobAt = this.now();

      const done = outcome.done.then(async (doneMsg) => {
        this.release(worker);
        if (!authRetried && doneLooksAuthStale(doneMsg)) {
          log("worker.auth_stale.retry", {
            worker_id: worker.id,
            agent_id: doneMsg.agentId,
            run_id: doneMsg.runId,
            phase: "wait",
          });
          await this.retire(worker, "auth");
          const retryJob: Omit<PromptJob, "requestId"> = {
            type: "prompt",
            agentId: doneMsg.agentId,
            prompt: job.prompt,
            ticketId: job.ticketId,
            event: job.event,
            model: job.model,
            workspace: job.workspace,
            control: job.control,
          };
          const retried = await this.submitInternal(retryJob, true);
          return retried.done;
        }
        return doneMsg;
      });

      return {
        agentId: outcome.accepted.agentId,
        runId: outcome.accepted.runId,
        done,
      };
    } catch (error) {
      if (worker.busy) {
        this.release(worker);
      }
      throw error;
    }
  }

  private dispatchRun(
    worker: WorkerSlot,
    job: WorkerJob,
  ): Promise<
    | { kind: "accepted"; accepted: WorkerAccepted; done: Promise<WorkerDone> }
    | { kind: "failed"; failed: WorkerFailed }
  > {
    return new Promise((resolve, reject) => {
      let settledAccepted = false;
      let doneResolve!: (value: WorkerDone) => void;
      let doneReject!: (reason: unknown) => void;
      const done = new Promise<WorkerDone>((res, rej) => {
        doneResolve = res;
        doneReject = rej;
      });

      const onMessage = (msg: WorkerMessage) => {
        if (!("requestId" in msg) || msg.requestId !== job.requestId) {
          return;
        }
        if (msg.phase === "accepted") {
          settledAccepted = true;
          resolve({ kind: "accepted", accepted: msg, done });
          return;
        }
        if (msg.phase === "failed") {
          cleanup();
          if (!settledAccepted) {
            resolve({ kind: "failed", failed: msg });
          } else {
            doneReject(failedToError(msg));
          }
          return;
        }
        if (msg.phase === "done") {
          cleanup();
          doneResolve(msg);
        }
      };
      const onExit = () => {
        cleanup();
        const err = new Error(`worker ${worker.id} exited during job`);
        if (!settledAccepted) {
          reject(err);
        } else {
          doneReject(err);
        }
      };
      const cleanup = () => {
        worker.child.off("message", onMessage);
        worker.child.off("exit", onExit);
      };
      worker.child.on("message", onMessage);
      worker.child.on("exit", onExit);
      worker.child.send(job);
    });
  }

  private dispatchUntil(
    worker: WorkerSlot,
    job: WorkerJob,
    phases: Array<WorkerMessage["phase"]>,
  ): Promise<WorkerMessage> {
    const accept = new Set(phases);
    return new Promise((resolve, reject) => {
      const onMessage = (msg: WorkerMessage) => {
        if (!("requestId" in msg) || msg.requestId !== job.requestId) {
          return;
        }
        if (!accept.has(msg.phase)) {
          return;
        }
        cleanup();
        resolve(msg);
      };
      const onExit = () => {
        cleanup();
        reject(new Error(`worker ${worker.id} exited during job`));
      };
      const cleanup = () => {
        worker.child.off("message", onMessage);
        worker.child.off("exit", onExit);
      };
      worker.child.on("message", onMessage);
      worker.child.on("exit", onExit);
      worker.child.send(job);
    });
  }

  private async lease(): Promise<WorkerSlot> {
    if (this.closed) {
      throw new Error("worker pool closed");
    }
    for (;;) {
      const idle = this.workers.find((w) => w.ready && !w.busy);
      if (idle) {
        if (this.shouldRecycle(idle)) {
          await this.retire(
            idle,
            recycleReason(idle, this.options, this.now()),
          );
          continue;
        }
        idle.busy = true;
        return idle;
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  private release(worker: WorkerSlot): void {
    worker.busy = false;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }

  private shouldRecycle(worker: WorkerSlot): boolean {
    const t = this.now();
    if (t - worker.lastJobAt > this.options.idleMs && worker.jobsCompleted > 0) {
      return true;
    }
    if (worker.jobsCompleted === 0 && t - worker.bornAt > this.options.idleMs) {
      return true;
    }
    if (t - worker.bornAt > this.options.maxAgeMs) {
      return true;
    }
    if (worker.jobsCompleted >= this.options.maxJobs) {
      return true;
    }
    return false;
  }

  private async retire(worker: WorkerSlot, reason: string): Promise<void> {
    const since = this.now() - this.lastRetireAt;
    if (since < this.options.retireBackoffMs) {
      await sleep(this.options.retireBackoffMs - since);
    }
    this.lastRetireAt = this.now();
    log("worker.retired", {
      worker_id: worker.id,
      reason,
      jobs_completed: worker.jobsCompleted,
      age_ms: this.now() - worker.bornAt,
    });
    const idx = this.workers.indexOf(worker);
    if (idx >= 0) {
      this.workers.splice(idx, 1);
    }
    await this.killWorker(worker);
    if (!this.closed) {
      await this.spawnWorker();
    }
  }

  private async spawnWorker(): Promise<void> {
    if (this.closed) {
      return;
    }
    const script = this.options.workerScript ?? defaultWorkerScript();
    const id = randomUUID().slice(0, 8);
    const isTs = script.endsWith(".ts");
    const child = fork(script, [], {
      env: { ...process.env, ...this.options.env },
      stdio: ["pipe", "inherit", "inherit", "ipc"],
      execArgv: isTs ? ["--import", "tsx"] : [],
    });

    const slot: WorkerSlot = {
      id,
      child,
      bornAt: this.now(),
      lastJobAt: this.now(),
      jobsCompleted: 0,
      busy: false,
      ready: false,
    };
    this.workers.push(slot);

    try {
      await new Promise<void>((resolve, reject) => {
        const onMessage = (msg: WorkerMessage) => {
          if (msg.phase === "ready") {
            slot.ready = true;
            cleanup();
            resolve();
          }
        };
        const onExit = (code: number | null) => {
          cleanup();
          if (this.closed) {
            resolve();
            return;
          }
          reject(new Error(`worker ${id} exited before ready: ${code}`));
        };
        const cleanup = () => {
          child.off("message", onMessage);
          child.off("exit", onExit);
        };
        child.on("message", onMessage);
        child.on("exit", onExit);
      });
    } catch (error) {
      const idx = this.workers.indexOf(slot);
      if (idx >= 0) {
        this.workers.splice(idx, 1);
      }
      throw error;
    }

    child.on("exit", () => {
      if (this.closed) {
        return;
      }
      const idx = this.workers.indexOf(slot);
      if (idx >= 0 && !slot.busy) {
        this.workers.splice(idx, 1);
        void this.spawnWorker().catch((err) => {
          console.error(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "worker.spawn.failed",
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      }
    });
  }

  private async killWorker(worker: WorkerSlot): Promise<void> {
    worker.ready = false;
    if (!worker.child.killed && worker.child.exitCode === null) {
      worker.child.kill("SIGTERM");
    }
    await new Promise<void>((resolve) => {
      if (worker.child.exitCode !== null) {
        resolve();
        return;
      }
      worker.child.once("exit", () => resolve());
      setTimeout(() => {
        if (worker.child.exitCode === null) {
          worker.child.kill("SIGKILL");
        }
        resolve();
      }, 2000);
    });
  }
}

function recycleReason(
  worker: WorkerSlot,
  options: PoolOptions,
  now: number,
): string {
  if (worker.jobsCompleted > 0 && now - worker.lastJobAt > options.idleMs) {
    return "idle";
  }
  if (now - worker.bornAt > options.maxAgeMs) {
    return "max_age";
  }
  if (worker.jobsCompleted >= options.maxJobs) {
    return "max_jobs";
  }
  return "pre_lease";
}

function failedToError(failed: WorkerFailed): Error {
  const err = new Error(failed.error);
  (err as Error & { code?: string }).code = failed.code;
  return err;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveWorkerScriptFromSrc(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "worker",
    "main.ts",
  );
}
