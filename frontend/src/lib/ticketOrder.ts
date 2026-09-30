/** Your work Assigned/Created display order: newest first (API remains ASC). */
export function ticketsNewestFirst<T extends { id: string; created_at: string }>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at);
    if (byCreated !== 0) return byCreated;
    return b.id.localeCompare(a.id);
  });
}
