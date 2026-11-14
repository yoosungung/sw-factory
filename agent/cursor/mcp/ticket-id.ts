/** Worker ticket JSON is wrapped: `{ ticket: { id, … } }`. Never read top-level `id`. */

export type TicketListItem = {
  id?: unknown;
  title?: unknown;
  date_from?: unknown;
  created_at?: unknown;
};

export function unwrapTicketId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("ticket.id missing: payload is not an object");
  }
  const ticket = (payload as { ticket?: unknown }).ticket;
  if (!ticket || typeof ticket !== "object") {
    throw new Error("ticket.id missing: expected { ticket: { id } } wrap");
  }
  const id = (ticket as { id?: unknown }).id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("ticket.id missing: empty id inside ticket wrap");
  }
  return id;
}

function ticketsFromList(payload: unknown): TicketListItem[] {
  if (!payload || typeof payload !== "object") return [];
  const tickets = (payload as { tickets?: unknown }).tickets;
  if (Array.isArray(tickets)) return tickets as TicketListItem[];
  if (Array.isArray(payload)) return payload as TicketListItem[];
  return [];
}

export function findSameDayTitle(
  listPayload: unknown,
  title: string,
  dateFrom: string,
): TicketListItem | undefined {
  return ticketsFromList(listPayload).find((t) => {
    if (typeof t.id !== "string" || !t.id) return false;
    if (t.title !== title) return false;
    if (typeof t.date_from === "string" && t.date_from) {
      return t.date_from === dateFrom || t.date_from.startsWith(dateFrom);
    }
    if (typeof t.created_at === "string" && t.created_at) {
      return t.created_at.startsWith(dateFrom);
    }
    return false;
  });
}

export type EnsureTicketCreateOnceDeps = {
  projectId: string;
  title: string;
  dateFrom: string;
  body: Record<string, unknown>;
  listTickets: (projectId: string) => Promise<unknown>;
  createTicket: (projectId: string, body: Record<string, unknown>) => Promise<unknown>;
};

export type EnsureTicketCreateOnceResult = {
  id: string;
  created: boolean;
  reused: boolean;
  parseRecovered?: boolean;
};

/**
 * Ticketless schedule create: reuse same-day same-title, POST ≤ 1.
 * Parse ambiguity → list/get recovery only — never retry POST.
 */
export async function ensureTicketCreateOnce(
  deps: EnsureTicketCreateOnceDeps,
): Promise<EnsureTicketCreateOnceResult> {
  const listed = await deps.listTickets(deps.projectId);
  const existing = findSameDayTitle(listed, deps.title, deps.dateFrom);
  if (existing && typeof existing.id === "string") {
    return { id: existing.id, created: false, reused: true };
  }

  const created = await deps.createTicket(deps.projectId, deps.body);
  try {
    const id = unwrapTicketId(created);
    return { id, created: true, reused: false };
  } catch (err) {
    const again = await deps.listTickets(deps.projectId);
    const recovered = findSameDayTitle(again, deps.title, deps.dateFrom);
    if (recovered && typeof recovered.id === "string") {
      return {
        id: recovered.id,
        created: true,
        reused: true,
        parseRecovered: true,
      };
    }
    throw err;
  }
}
