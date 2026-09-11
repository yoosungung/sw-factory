export type StatusCategory = "backlog" | "active" | "done";

export type ProjectStatus = {
  key: string;
  label: string;
  category: StatusCategory;
  sort_order: number;
};

export const DEFAULT_PROJECT_STATUSES: ProjectStatus[] = [
  { key: "backlog", label: "Backlog", category: "backlog", sort_order: 0 },
  { key: "in_progress", label: "In Progress", category: "active", sort_order: 1 },
  { key: "review", label: "Review", category: "active", sort_order: 2 },
  { key: "deploying_test", label: "Deploying Test", category: "active", sort_order: 3 },
  { key: "qa", label: "QA", category: "active", sort_order: 4 },
  { key: "deploying_prod", label: "Deploying Prod", category: "active", sort_order: 5 },
  { key: "done", label: "Done", category: "done", sort_order: 6 },
  { key: "blocked", label: "Blocked", category: "active", sort_order: 7 },
  { key: "waiting_for_approval", label: "Waiting for Approval", category: "active", sort_order: 8 },
];

const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const CATEGORIES = new Set<string>(["backlog", "active", "done"]);

export function isValidStatusKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function seedStatusStatements(db: D1Database, projectId: string): D1PreparedStatement[] {
  return DEFAULT_PROJECT_STATUSES.map((s) =>
    db
      .prepare(
        `INSERT INTO project_statuses (project_id, key, label, category, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(projectId, s.key, s.label, s.category, s.sort_order),
  );
}

export async function listProjectStatuses(
  db: D1Database,
  projectId: string,
): Promise<ProjectStatus[]> {
  const { results } = await db
    .prepare(
      `SELECT key, label, category, sort_order FROM project_statuses
       WHERE project_id = ? ORDER BY sort_order ASC, key ASC`,
    )
    .bind(projectId)
    .all<ProjectStatus>();
  return results ?? [];
}

export async function defaultTicketStatus(
  db: D1Database,
  projectId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT key FROM project_statuses
       WHERE project_id = ? AND category = 'backlog'
       ORDER BY sort_order ASC, key ASC LIMIT 1`,
    )
    .bind(projectId)
    .first<{ key: string }>();
  return row?.key ?? null;
}

export async function projectHasStatus(
  db: D1Database,
  projectId: string,
  key: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM project_statuses WHERE project_id = ? AND key = ?`)
    .bind(projectId, key)
    .first<{ ok: number }>();
  return !!row;
}

export type StatusInput = {
  key?: string;
  label?: string;
  category?: string;
  sort_order?: number;
};

export function normalizeStatusList(
  raw: StatusInput[] | undefined,
): { ok: true; statuses: ProjectStatus[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "invalid_input" };
  }
  const statuses: ProjectStatus[] = [];
  const seen = new Set<string>();
  let backlogCount = 0;
  let doneCount = 0;

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const key = item.key?.trim() ?? "";
    const label = item.label?.trim() ?? "";
    const category = item.category?.trim() ?? "";
    if (!isValidStatusKey(key) || !label || !CATEGORIES.has(category)) {
      return { ok: false, error: "invalid_input" };
    }
    if (seen.has(key)) return { ok: false, error: "duplicate_key" };
    seen.add(key);
    if (category === "backlog") backlogCount += 1;
    if (category === "done") doneCount += 1;
    statuses.push({
      key,
      label,
      category: category as StatusCategory,
      sort_order: typeof item.sort_order === "number" ? item.sort_order : i,
    });
  }

  if (backlogCount < 1 || doneCount < 1) {
    return { ok: false, error: "invalid_categories" };
  }

  statuses.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
  statuses.forEach((s, i) => {
    s.sort_order = i;
  });
  return { ok: true, statuses };
}
