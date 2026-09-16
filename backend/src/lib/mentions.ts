/** `@Handle` tokens; skips email mid-@ (alphanumeric immediately before `@`). */
const MENTION_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9][A-Za-z0-9_-]*)/g;

/** Lowercased unique handles from Markdown comment body. */
export function extractMentionHandles(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    found.add(m[2]!.toLowerCase());
  }
  return [...found];
}

/**
 * Resolve `@Name` in body to project member user ids (case-insensitive `users.name`).
 */
export async function resolveMentionUserIds(
  db: D1Database,
  projectId: string,
  body: string,
): Promise<string[]> {
  const handles = extractMentionHandles(body);
  if (handles.length === 0) return [];

  const { results } = await db
    .prepare(
      `SELECT u.id, u.name
       FROM users u
       JOIN project_members pm ON pm.user_id = u.id
       WHERE pm.project_id = ?`,
    )
    .bind(projectId)
    .all<{ id: string; name: string }>();

  const byName = new Map<string, string[]>();
  for (const row of results ?? []) {
    const key = row.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(row.id);
    byName.set(key, list);
  }

  const ids = new Set<string>();
  for (const handle of handles) {
    for (const id of byName.get(handle) ?? []) ids.add(id);
  }
  return [...ids];
}
