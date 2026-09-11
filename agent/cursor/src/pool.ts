import type { PromptJob, SdkBackend } from "./types";

type WorkerSlot = {
  id: number;
  busy: boolean;
  jobs: number;
  bornAt: number;
};

/**
 * Parent-owned pool: leases slots; does not import @cursor/sdk.
 * Actual work is delegated to SdkBackend (child/mock).
 */
export class WorkerPool {
  private slots: WorkerSlot[];
  private waiters: Array<() => void> = [];

  constructor(
    private size: number,
    private backend: SdkBackend,
  ) {
    this.slots = Array.from({ length: size }, (_, i) => ({
      id: i,
      busy: false,
      jobs: 0,
      bornAt: Date.now(),
    }));
  }

  get poolSize(): number {
    return this.size;
  }

  private acquire(): WorkerSlot | null {
    const free = this.slots.find((s) => !s.busy);
    if (!free) return null;
    free.busy = true;
    return free;
  }

  private release(slot: WorkerSlot): void {
    slot.busy = false;
    slot.jobs += 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  async runJob(job: PromptJob): Promise<{ runId: string }> {
    let slot = this.acquire();
    if (!slot) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
      slot = this.acquire();
      if (!slot) throw new Error("pool_exhausted");
    }
    try {
      return await this.backend.send({
        agentId: job.agentId,
        prompt: job.prompt,
        cwd: "", // filled by caller via session
      });
    } finally {
      this.release(slot);
    }
  }

  /** Test helper: how many slots currently busy */
  busyCount(): number {
    return this.slots.filter((s) => s.busy).length;
  }
}
