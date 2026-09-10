import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { newId, nowIso } from "../lib/crypto";
import {
  getClientMembership,
  requireAuth,
  requireProjectMember,
} from "../middleware/auth";

export const projectRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

projectRoutes.use("/projects/*", requireAuth);
projectRoutes.use("/projects", requireAuth);

projectRoutes.get("/projects", async (c) => {
  const user = c.get("user");
  const clientId = c.req.query("client_id");
  let sql = `SELECT p.id, p.client_id, p.name, p.description, p.created_by, p.created_at, pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ?`;
  const binds: string[] = [user.id];
  if (clientId) {
    sql += ` AND p.client_id = ?`;
    binds.push(clientId);
  }
  sql += ` ORDER BY p.created_at DESC`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ projects: results });
});

projectRoutes.post("/projects", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name?: string;
    description?: string;
    client_id?: string;
  }>();
  const name = body.name?.trim();
  const clientId = body.client_id?.trim();
  if (!name || !clientId) return c.json({ error: "invalid_input" }, 400);

  const clientRole = await getClientMembership(c.env.DB, clientId, user.id);
  if (!clientRole) return c.json({ error: "forbidden" }, 403);

  const id = newId();
  const created_at = nowIso();
  const description = body.description?.trim() ?? "";

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO projects (id, client_id, name, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, clientId, name, description, user.id, created_at),
    c.env.DB.prepare(
      `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')`,
    ).bind(id, user.id),
  ]);

  return c.json(
    {
      project: {
        id,
        client_id: clientId,
        name,
        description,
        created_by: user.id,
        created_at,
        role: "owner",
      },
    },
    201,
  );
});

projectRoutes.get("/projects/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const project = await c.env.DB.prepare(
    `SELECT id, client_id, name, description, created_by, created_at FROM projects WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!project) return c.json({ error: "not_found" }, 404);
  return c.json({ project: { ...project, role } });
});

projectRoutes.patch("/projects/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{
    name?: string;
    description?: string;
    client_id?: string;
  }>();
  const project = await c.env.DB.prepare(
    `SELECT id, client_id, name, description, created_by, created_at FROM projects WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      client_id: string | null;
      name: string;
      description: string;
      created_by: string;
      created_at: string;
    }>();
  if (!project) return c.json({ error: "not_found" }, 404);

  let clientId = project.client_id;
  if (body.client_id !== undefined) {
    const nextClient = body.client_id.trim();
    const clientRole = await getClientMembership(c.env.DB, nextClient, user.id);
    if (!clientRole) return c.json({ error: "forbidden" }, 403);
    clientId = nextClient;
  }

  const name = body.name?.trim() ?? project.name;
  const description =
    body.description !== undefined ? body.description.trim() : project.description;

  await c.env.DB.prepare(
    `UPDATE projects SET name = ?, description = ?, client_id = ? WHERE id = ?`,
  )
    .bind(name, description, clientId, id)
    .run();

  return c.json({
    project: { ...project, name, description, client_id: clientId, role },
  });
});

projectRoutes.delete("/projects/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  await c.env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

projectRoutes.get("/projects/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT pm.user_id, pm.role, u.email, u.name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ?
     ORDER BY pm.role ASC, u.name ASC`,
  )
    .bind(id)
    .all();

  return c.json({ members: results });
});

projectRoutes.post("/projects/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{ user_id?: string; role?: string }>();
  const userId = body.user_id?.trim();
  const memberRole = body.role === "owner" || body.role === "member" ? body.role : null;
  if (!userId || !memberRole) return c.json({ error: "invalid_input" }, 400);

  const project = await c.env.DB.prepare(`SELECT client_id FROM projects WHERE id = ?`)
    .bind(id)
    .first<{ client_id: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);

  const clientRole = await getClientMembership(c.env.DB, project.client_id, userId);
  if (!clientRole) return c.json({ error: "not_client_member" }, 400);

  const target = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  if (!target) return c.json({ error: "not_found" }, 404);

  await c.env.DB.prepare(
    `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`,
  )
    .bind(id, userId, memberRole)
    .run();

  const member = await c.env.DB.prepare(
    `SELECT pm.user_id, pm.role, u.email, u.name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND pm.user_id = ?`,
  )
    .bind(id, userId)
    .first();

  return c.json({ member }, 201);
});

projectRoutes.delete("/projects/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  const targetRole = await requireProjectMember(c.env.DB, id, targetUserId);
  if (!targetRole) return c.json({ error: "not_found" }, 404);

  if (targetRole === "owner") {
    const owners = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM project_members WHERE project_id = ? AND role = 'owner'`,
    )
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) return c.json({ error: "last_owner" }, 400);
  }

  await c.env.DB.prepare(
    `DELETE FROM project_members WHERE project_id = ? AND user_id = ?`,
  )
    .bind(id, targetUserId)
    .run();

  return c.json({ ok: true });
});
