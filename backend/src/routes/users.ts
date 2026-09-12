import { Hono } from "hono";
import type { Env, AppVariables, User } from "../env";
import { requireAuth } from "../middleware/auth";

export const userRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

userRoutes.use("*", requireAuth);

function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    is_admin: !!u.is_admin,
    created_at: u.created_at,
  };
}

userRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ error: "invalid_input" }, 400);

  let limit = Number(c.req.query("limit") ?? 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 20) limit = 20;

  const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const rows = await c.env.DB.prepare(
    `SELECT id, email, name
     FROM users
     WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
     ORDER BY name COLLATE NOCASE
     LIMIT ?`,
  )
    .bind(like, like, limit)
    .all<{ id: string; email: string; name: string }>();

  return c.json({ users: rows.results ?? [] });
});

userRoutes.patch("/me", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string }>();
  const user = c.get("user");
  let name = user.name;
  let email = user.email;

  if (body.name !== undefined) {
    name = body.name.trim();
    if (!name) return c.json({ error: "invalid_input" }, 400);
  }
  if (body.email !== undefined) {
    email = body.email.trim().toLowerCase();
    if (!email || !email.includes("@")) return c.json({ error: "invalid_input" }, 400);
    if (email !== user.email) {
      const taken = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`)
        .bind(email, user.id)
        .first();
      if (taken) return c.json({ error: "email_taken" }, 409);
    }
  }

  await c.env.DB.prepare(`UPDATE users SET name = ?, email = ? WHERE id = ?`)
    .bind(name, email, user.id)
    .run();

  const updated: User = { ...user, name, email };
  c.set("user", updated);
  return c.json({ user: publicUser(updated) });
});
