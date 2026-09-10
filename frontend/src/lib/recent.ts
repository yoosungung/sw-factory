const RECENT_PROJECTS_KEY = "lt_recent_projects";
const RECENT_TICKETS_KEY = "lt_recent_tickets";
const MAX = 12;

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushId(key: string, id: string) {
  const next = [id, ...readIds(key).filter((x) => x !== id)].slice(0, MAX);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

export function touchRecentProject(id: string) {
  return pushId(RECENT_PROJECTS_KEY, id);
}

export function touchRecentTicket(id: string) {
  return pushId(RECENT_TICKETS_KEY, id);
}

export function recentProjectIds() {
  return readIds(RECENT_PROJECTS_KEY);
}

export function recentTicketIds() {
  return readIds(RECENT_TICKETS_KEY);
}
