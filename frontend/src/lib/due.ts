export function dueClass(dueAt: string | null | undefined) {
  if (!dueAt) return "";
  const due = new Date(`${dueAt}T23:59:59`);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  if (due.getTime() < now.getTime()) return "due overdue";
  if (due.getTime() - now.getTime() <= 3 * dayMs) return "due soon";
  return "due";
}
