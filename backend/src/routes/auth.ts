import { Hono } from "hono";
import type { Env, AppVariables, User } from "../env";
import {
  clearSessionCookie,
  hashPassword,
  newId,
  nowIso,
  SESSION_DAYS,
  sessionCookie,
  verifyPassword,
} from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { asAdminFlag } from "../lib/users";

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    is_admin: !!u.is_admin,
    created_at: u.created_at,
  };
}

authRoutes.post("/register", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim() ?? "";
  if (!email || !password || password.length < 8 || !name) {
    return c.json({ error: "invalid_input" }, 400);
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first();
  if (existing) return c.json({ error: "email_taken" }, 409);

  const id = newId();
  const created_at = nowIso();
  const password_hash = await hashPassword(password, c.env.SESSION_SECRET);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, email, password_hash, name, created_at)
    .run();

  const sessionId = newId();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(sessionId, id, expires, created_at)
    .run();

  c.header("Set-Cookie", sessionCookie(sessionId, SESSION_DAYS * 86400));
  return c.json({ user: publicUser({ id, email, name, is_admin: false, created_at }) }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) return c.json({ error: "invalid_input" }, 400);

  const row = await c.env.DB.prepare(
    `SELECT id, email, name, is_admin, created_at, password_hash FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<User & { password_hash: string; is_admin: number | boolean }>();

  if (!row || !(await verifyPassword(password, row.password_hash, c.env.SESSION_SECRET))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const sessionId = newId();
  const created_at = nowIso();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(sessionId, row.id, expires, created_at)
    .run();

  c.header("Set-Cookie", sessionCookie(sessionId, SESSION_DAYS * 86400));
  return c.json({
    user: publicUser({
      id: row.id,
      email: row.email,
      name: row.name,
      is_admin: asAdminFlag(row.is_admin),
      created_at: row.created_at,
    }),
  });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const match = /lt_session=([^;]+)/.exec(cookie);
  if (match) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(match[1]).run();
  }
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  return c.json({ user: publicUser(c.get("user")) });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const body = await c.req.json<{ current_password?: string; new_password?: string }>();
  const current = body.current_password ?? "";
  const next = body.new_password ?? "";
  if (!current || next.length < 8) return c.json({ error: "invalid_input" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash, c.env.SESSION_SECRET))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const password_hash = await hashPassword(next, c.env.SESSION_SECRET);
  await c.env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .bind(password_hash, user.id)
    .run();
  return c.json({ ok: true });
});
