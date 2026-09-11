import type { SessionRecord } from "./types";

/** ticket_id → agentId sticky map (cursor-owned). */
export class SessionMap {
  private byAgent = new Map<string, SessionRecord>();
  private byTicketPersona = new Map<string, string>();

  private key(ticketId: string, persona: string): string {
    return `${ticketId}:${persona}`;
  }

  get(agentId: string): SessionRecord | undefined {
    return this.byAgent.get(agentId);
  }

  getByTicket(ticketId: string, persona: string): SessionRecord | undefined {
    const id = this.byTicketPersona.get(this.key(ticketId, persona));
    return id ? this.byAgent.get(id) : undefined;
  }

  set(record: SessionRecord): void {
    this.byAgent.set(record.agentId, record);
    if (record.ticketId) {
      this.byTicketPersona.set(this.key(record.ticketId, record.persona), record.agentId);
    }
  }

  delete(agentId: string): void {
    const rec = this.byAgent.get(agentId);
    if (!rec) return;
    this.byAgent.delete(agentId);
    if (rec.ticketId) {
      this.byTicketPersona.delete(this.key(rec.ticketId, rec.persona));
    }
  }

  remap(oldAgentId: string, newRecord: SessionRecord): void {
    this.delete(oldAgentId);
    this.set(newRecord);
  }

  all(): SessionRecord[] {
    return [...this.byAgent.values()];
  }
}
