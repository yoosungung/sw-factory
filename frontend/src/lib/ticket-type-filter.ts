export type TicketTypeFilter = "all" | "task" | "milestone";

export function parseTicketTypeFilter(raw: string | null): TicketTypeFilter {
  if (raw === "task" || raw === "milestone") return raw;
  return "all";
}

export function matchesTicketTypeFilter(
  type: string,
  filter: TicketTypeFilter,
): boolean {
  return filter === "all" || type === filter;
}
