/** List / Your work: newest created_at first (tie → id DESC). */
export function ticketsNewestFirst<T extends { id: string; created_at: string }>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at);
    if (byCreated !== 0) return byCreated;
    return b.id.localeCompare(a.id);
  });
}

/** Board/Backlog column: append/new (higher sort_order) above older cards; then created_at. */
export function kanbanColumnNewestFirst<
  T extends { id: string; sort_order: number; created_at: string },
>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return b.sort_order - a.sort_order;
    const byCreated = b.created_at.localeCompare(a.created_at);
    if (byCreated !== 0) return byCreated;
    return b.id.localeCompare(a.id);
  });
}

/** Timeline rows: newest date_from (else created_at) first. Axis direction is unchanged. */
export function timelineNewestFirst<
  T extends { id: string; date_from: string | null; created_at: string },
>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    const ak = a.date_from ?? a.created_at;
    const bk = b.date_from ?? b.created_at;
    const byKey = bk.localeCompare(ak);
    if (byKey !== 0) return byKey;
    return b.id.localeCompare(a.id);
  });
}
