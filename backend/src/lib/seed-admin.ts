import type { Env } from "../env";
import { hashPassword, newId, nowIso } from "./crypto";

export async function ensureSeedAdmin(env: Env): Promise<void> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) return;

  const existingAdmin = await env.DB.prepare(
    `SELECT id FROM users WHERE is_admin = 1 LIMIT 1`,
  ).first();
  if (existingAdmin) return;

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    await env.DB.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).bind(existing.id).run();
    return;
  }

  const id = newId();
  const created_at = nowIso();
  const password_hash = await hashPassword(password, env.SESSION_SECRET);
  const name = env.ADMIN_NAME?.trim() || "Admin";
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, is_admin, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
      .bind(id, email, password_hash, name, created_at)
      .run();
  } catch {
    await env.DB.prepare(`UPDATE users SET is_admin = 1 WHERE email = ?`).bind(email).run();
  }
}
