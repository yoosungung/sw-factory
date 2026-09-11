export function asAdminFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export async function resolveUserId(
  db: D1Database,
  body: { user_id?: string; email?: string },
): Promise<{ userId: string } | { error: "invalid_input" | "not_found" }> {
  const userId = body.user_id?.trim();
  const email = body.email?.trim().toLowerCase();
  if (userId) {
    const row = await db.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first<{ id: string }>();
    return row ? { userId: row.id } : { error: "not_found" };
  }
  if (email) {
    const row = await db.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();
    return row ? { userId: row.id } : { error: "not_found" };
  }
  return { error: "invalid_input" };
}
