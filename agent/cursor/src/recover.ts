import type { SessionMap } from "./session-map";
import type { SdkBackend, SessionRecord } from "./types";

export type RecoverReason =
  | "R1_worker_crash"
  | "R2_active_run_fail"
  | "R3_skip_threshold"
  | "R4_session_recreate"
  | "R5_recover_log";

export type RecoverLog = {
  reason: RecoverReason;
  agentId: string;
  ticketId: string | null;
  detail?: string;
  at: string;
};

/**
 * R1–R5 zombie / busy recovery helpers.
 */
export class Recover {
  logs: RecoverLog[] = [];

  constructor(
    private sessions: SessionMap,
    private backend: SdkBackend,
    private skipLimit: number,
  ) {}

  private log(entry: Omit<RecoverLog, "at">): void {
    this.logs.push({ ...entry, at: new Date().toISOString() });
  }

  /** R1: worker crash → clear busy + cancel/forget */
  async onWorkerCrash(agentId: string): Promise<void> {
    const rec = this.sessions.get(agentId);
    if (!rec) return;
    rec.activeRun = false;
    rec.skipCount = 0;
    this.sessions.set(rec);
    await this.safeCancel(agentId);
    this.log({
      reason: "R1_worker_crash",
      agentId,
      ticketId: rec.ticketId,
    });
  }

  /** R2: active_run fail path */
  async onActiveRunFail(agentId: string, detail?: string): Promise<void> {
    const rec = this.sessions.get(agentId);
    if (!rec) return;
    rec.activeRun = false;
    this.sessions.set(rec);
    await this.safeCancel(agentId);
    this.log({
      reason: "R2_active_run_fail",
      agentId,
      ticketId: rec.ticketId,
      detail,
    });
  }

  /** cancel must never reject into fire-and-forget prompt handlers */
  private async safeCancel(agentId: string): Promise<void> {
    try {
      await this.backend.cancel?.(agentId);
    } catch (err) {
      this.log({
        reason: "R5_recover_log",
        agentId,
        ticketId: this.sessions.get(agentId)?.ticketId ?? null,
        detail: `cancel_failed:${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * R3: consecutive skipped_active_run → force clear.
   * Returns true if caller should treat as sdk_zombie (rebind).
   */
  onSkippedBusy(agentId: string): "busy" | "sdk_zombie" {
    const rec = this.sessions.get(agentId);
    if (!rec) return "busy";
    rec.skipCount += 1;
    this.sessions.set(rec);
    if (rec.skipCount >= this.skipLimit) {
      rec.activeRun = false;
      rec.skipCount = 0;
      this.sessions.set(rec);
      this.log({
        reason: "R3_skip_threshold",
        agentId,
        ticketId: rec.ticketId,
      });
      return "sdk_zombie";
    }
    return "busy";
  }

  /** R4: create new session + remap */
  async recreateSession(
    oldAgentId: string,
    opts: { persona: string; cwd: string; prompt: string; ticketId: string | null },
  ): Promise<SessionRecord> {
    const created = await this.backend.create({
      persona: opts.persona,
      cwd: opts.cwd,
      prompt: opts.prompt,
    });
    const record: SessionRecord = {
      agentId: created.agentId,
      persona: opts.persona,
      ticketId: opts.ticketId,
      cwd: opts.cwd,
      activeRun: false,
      skipCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.sessions.remap(oldAgentId, record);
    this.log({
      reason: "R4_session_recreate",
      agentId: record.agentId,
      ticketId: opts.ticketId,
      detail: `from=${oldAgentId}`,
    });
    return record;
  }

  /** R5: structured recover log surface for tests/ops */
  snapshot(): RecoverLog[] {
    this.log({
      reason: "R5_recover_log",
      agentId: "*",
      ticketId: null,
      detail: `count=${this.logs.length}`,
    });
    return [...this.logs];
  }
}
