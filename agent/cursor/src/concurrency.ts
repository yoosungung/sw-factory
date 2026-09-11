/**
 * ticket_id mutex + persona active/queue limits.
 */
export class ConcurrencyGuard {
  private ticketLocks = new Set<string>();
  private personaActive = new Map<string, number>();
  private personaQueue = new Map<string, number>();
  private createTimestamps = new Map<string, number[]>();

  constructor(
    private maxActivePerPersona: number,
    private maxQueuePerPersona: number,
    private createThrottleMs: number,
  ) {}

  tryAcquireTicket(ticketId: string | null): boolean {
    if (!ticketId) return true;
    if (this.ticketLocks.has(ticketId)) return false;
    this.ticketLocks.add(ticketId);
    return true;
  }

  releaseTicket(ticketId: string | null): void {
    if (ticketId) this.ticketLocks.delete(ticketId);
  }

  tryEnqueuePersona(persona: string): "ok" | "active_full" | "queue_full" {
    const active = this.personaActive.get(persona) ?? 0;
    if (active < this.maxActivePerPersona) {
      this.personaActive.set(persona, active + 1);
      return "ok";
    }
    const q = this.personaQueue.get(persona) ?? 0;
    if (q >= this.maxQueuePerPersona) return "queue_full";
    this.personaQueue.set(persona, q + 1);
    return "active_full";
  }

  /** Move from queue to active when a slot frees, or just release active. */
  releasePersona(persona: string, fromQueue = false): void {
    if (fromQueue) {
      const q = this.personaQueue.get(persona) ?? 0;
      if (q > 0) this.personaQueue.set(persona, q - 1);
      return;
    }
    const active = this.personaActive.get(persona) ?? 0;
    if (active > 0) this.personaActive.set(persona, active - 1);
    const q = this.personaQueue.get(persona) ?? 0;
    if (q > 0 && (this.personaActive.get(persona) ?? 0) < this.maxActivePerPersona) {
      this.personaQueue.set(persona, q - 1);
      this.personaActive.set(persona, (this.personaActive.get(persona) ?? 0) + 1);
    }
  }

  checkCreateThrottle(ticketId: string | null): boolean {
    if (!ticketId) return true;
    const now = Date.now();
    const prev = (this.createTimestamps.get(ticketId) ?? []).filter(
      (t) => now - t < this.createThrottleMs,
    );
    if (prev.length >= 3) {
      this.createTimestamps.set(ticketId, prev);
      return false;
    }
    prev.push(now);
    this.createTimestamps.set(ticketId, prev);
    return true;
  }
}
