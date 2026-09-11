import { createMiddleware } from "hono/factory";
import type { Env, User, AppVariables } from "../env";
import { parseCookie, SESSION_COOKIE, nowIso } from "../lib/crypto";
import { asAdminFlag } from "../lib/users";

export const requireAuth = createMiddleware<{ Bindings: Env; Variables: AppVariables }>(
  async (c, next) => {
    const token = parseCookie(c.req.header("Cookie"), SESSION_COOKIE);
    if (!token) return c.json({ error: "unauthorized" }, 401);

    const row = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.is_admin, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
      .bind(token)
      .first<User & { expires_at: string; is_admin: number | boolean }>();

    if (!row || row.expires_at < nowIso()) {
      if (token) {
        await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(token).run();
      }
      return c.json({ error: "unauthorized" }, 401);
    }

    c.set("user", {
      id: row.id,
      email: row.email,
      name: row.name,
      is_admin: asAdminFlag(row.is_admin),
      created_at: row.created_at,
    });
    await next();
  },
);

export async function getMembership(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<"owner" | "member" | null> {
  const row = await db
    .prepare(`SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`)
    .bind(projectId, userId)
    .first<{ role: "owner" | "member" }>();
  return row?.role ?? null;
}

export async function requireProjectMember(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<"owner" | "member" | null> {
  return getMembership(db, projectId, userId);
}

export async function getClientMembership(
  db: D1Database,
  clientId: string,
  userId: string,
): Promise<"owner" | "member" | null> {
  const row = await db
    .prepare(`SELECT role FROM client_members WHERE client_id = ? AND user_id = ?`)
    .bind(clientId, userId)
    .first<{ role: "owner" | "member" }>();
  return row?.role ?? null;
}
