/** List Due cell: prefer due_at; else date_from→date_to range (Timeline merge). */
export function formatListDue(t: {
  due_at: string | null;
  date_from: string | null;
  date_to: string | null;
}): string {
  if (t.due_at) return t.due_at;
  if (t.date_from || t.date_to) {
    return `${t.date_from ?? "—"} → ${t.date_to ?? "—"}`;
  }
  return "—";
}
