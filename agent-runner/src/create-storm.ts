/** Per-ticket create-storm circuit breaker. */

export interface CreateStormOptions {
  windowMs?: number;
  maxAttempts?: number;
  now?: () => number;
}

export class CreateThrottledError extends Error {
  readonly ticketId: number;

  constructor(ticketId: number) {
    super(`create_throttled:ticket:${ticketId}`);
    this.name = "CreateThrottledError";
    this.ticketId = ticketId;
  }
}

interface StormState {
  windowStart: number;
  attempts: number;
  progressed: boolean;
}

/**
 * Rejects further creates for a ticket when many creates land in a window
 * without a successful run start/completion.
 */
export class CreateStormGuard {
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly now: () => number;
  private readonly byTicket = new Map<number, StormState>();

  constructor(options: CreateStormOptions = {}) {
    this.windowMs = options.windowMs ?? 120_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.now = options.now ?? Date.now;
  }

  /** Call before submitting a new create for ticketId. */
  beforeCreate(ticketId: number): void {
    const t = this.now();
    let state = this.byTicket.get(ticketId);
    if (!state || t - state.windowStart > this.windowMs) {
      state = { windowStart: t, attempts: 0, progressed: false };
      this.byTicket.set(ticketId, state);
    }
    if (!state.progressed && state.attempts >= this.maxAttempts) {
      throw new CreateThrottledError(ticketId);
    }
    state.attempts += 1;
  }

  /** Call when a create run is accepted / completed / failed with progress. */
  markProgress(ticketId: number): void {
    const state = this.byTicket.get(ticketId);
    if (!state) {
      return;
    }
    state.progressed = true;
    state.attempts = 0;
    state.windowStart = this.now();
  }

  clear(ticketId: number): void {
    this.byTicket.delete(ticketId);
  }
}
