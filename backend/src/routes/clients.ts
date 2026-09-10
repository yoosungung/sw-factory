import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { newId, nowIso } from "../lib/crypto";
import { getClientMembership, requireAuth } from "../middleware/auth";

export const clientRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

clientRoutes.use("/clients/*", requireAuth);
clientRoutes.use("/clients", requireAuth);

clientRoutes.get("/clients", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.description, c.created_by, c.created_at, cm.role
     FROM clients c
     JOIN client_members cm ON cm.client_id = c.id
     WHERE cm.user_id = ?
     ORDER BY c.created_at DESC`,
  )
    .bind(user.id)
    .all();
  return c.json({ clients: results });
});

clientRoutes.post("/clients", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; description?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "invalid_input" }, 400);

  const id = newId();
  const created_at = nowIso();
  const description = body.description?.trim() ?? "";

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO clients (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, name, description, user.id, created_at),
    c.env.DB.prepare(
      `INSERT INTO client_members (client_id, user_id, role) VALUES (?, ?, 'owner')`,
    ).bind(id, user.id),
  ]);

  return c.json(
    { client: { id, name, description, created_by: user.id, created_at, role: "owner" } },
    201,
  );
});

clientRoutes.get("/clients/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const client = await c.env.DB.prepare(
    `SELECT id, name, description, created_by, created_at FROM clients WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!client) return c.json({ error: "not_found" }, 404);
  return c.json({ client: { ...client, role } });
});

clientRoutes.patch("/clients/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{ name?: string; description?: string }>();
  const client = await c.env.DB.prepare(
    `SELECT id, name, description, created_by, created_at FROM clients WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      name: string;
      description: string;
      created_by: string;
      created_at: string;
    }>();
  if (!client) return c.json({ error: "not_found" }, 404);

  const name = body.name?.trim() ?? client.name;
  const description =
    body.description !== undefined ? body.description.trim() : client.description;

  await c.env.DB.prepare(`UPDATE clients SET name = ?, description = ? WHERE id = ?`)
    .bind(name, description, id)
    .run();

  return c.json({ client: { ...client, name, description, role } });
});

clientRoutes.delete("/clients/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  await c.env.DB.prepare(`DELETE FROM clients WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

clientRoutes.get("/clients/:id/projects", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.client_id, p.name, p.description, p.created_by, p.created_at, pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE p.client_id = ? AND pm.user_id = ?
     ORDER BY p.created_at DESC`,
  )
    .bind(id, user.id)
    .all();

  return c.json({ projects: results });
});

clientRoutes.get("/clients/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT cm.user_id, cm.role, u.email, u.name
     FROM client_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.client_id = ?
     ORDER BY cm.role ASC, u.name ASC`,
  )
    .bind(id)
    .all();

  return c.json({ members: results });
});

clientRoutes.post("/clients/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{ user_id?: string; role?: string }>();
  const userId = body.user_id?.trim();
  const memberRole = body.role === "owner" || body.role === "member" ? body.role : null;
  if (!userId || !memberRole) return c.json({ error: "invalid_input" }, 400);

  const target = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  if (!target) return c.json({ error: "not_found" }, 404);

  await c.env.DB.prepare(
    `INSERT INTO client_members (client_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(client_id, user_id) DO UPDATE SET role = excluded.role`,
  )
    .bind(id, userId, memberRole)
    .run();

  const member = await c.env.DB.prepare(
    `SELECT cm.user_id, cm.role, u.email, u.name
     FROM client_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.client_id = ? AND cm.user_id = ?`,
  )
    .bind(id, userId)
    .first();

  return c.json({ member }, 201);
});

clientRoutes.delete("/clients/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const role = await getClientMembership(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  const targetRole = await getClientMembership(c.env.DB, id, targetUserId);
  if (!targetRole) return c.json({ error: "not_found" }, 404);

  if (targetRole === "owner") {
    const owners = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM client_members WHERE client_id = ? AND role = 'owner'`,
    )
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) return c.json({ error: "last_owner" }, 400);
  }

  await c.env.DB.prepare(
    `DELETE FROM client_members WHERE client_id = ? AND user_id = ?`,
  )
    .bind(id, targetUserId)
    .run();

  return c.json({ ok: true });
});
