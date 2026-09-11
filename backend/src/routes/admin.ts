import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { asAdminFlag } from "../lib/users";
import { requireAuth } from "../middleware/auth";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

adminRoutes.use("*", requireAuth);

function requirePlatformAdmin(isAdmin: boolean) {
  return isAdmin;
}

adminRoutes.get("/users", async (c) => {
  const user = c.get("user");
  if (!requirePlatformAdmin(user.is_admin)) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at ASC`,
  ).all<{
    id: string;
    email: string;
    name: string;
    is_admin: number;
    created_at: string;
  }>();

  return c.json({
    users: results.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      is_admin: asAdminFlag(u.is_admin),
      created_at: u.created_at,
    })),
  });
});

adminRoutes.patch("/users/:id", async (c) => {
  const actor = c.get("user");
  if (!requirePlatformAdmin(actor.is_admin)) return c.json({ error: "forbidden" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ is_admin?: boolean }>();
  if (typeof body.is_admin !== "boolean") return c.json({ error: "invalid_input" }, 400);

  const target = await c.env.DB.prepare(
    `SELECT id, is_admin FROM users WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; is_admin: number }>();
  if (!target) return c.json({ error: "not_found" }, 404);

  const wasAdmin = asAdminFlag(target.is_admin);
  if (wasAdmin && body.is_admin === false) {
    const owners = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`,
    ).first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) return c.json({ error: "last_admin" }, 400);
  }

  await c.env.DB.prepare(`UPDATE users SET is_admin = ? WHERE id = ?`)
    .bind(body.is_admin ? 1 : 0, id)
    .run();

  const updated = await c.env.DB.prepare(
    `SELECT id, email, name, is_admin, created_at FROM users WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      email: string;
      name: string;
      is_admin: number;
      created_at: string;
    }>();

  return c.json({
    user: updated
      ? { ...updated, is_admin: asAdminFlag(updated.is_admin) }
      : { id, is_admin: body.is_admin },
  });
});
