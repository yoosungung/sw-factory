import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { newId, nowIso } from "../lib/crypto";
import {
  listProjectStatuses,
  normalizeStatusList,
  seedStatusStatements,
  type StatusInput,
} from "../lib/statuses";
import { resolveUserId } from "../lib/users";
import {
  getClientMembership,
  requireAuth,
  requireProjectMember,
} from "../middleware/auth";

const MEMBER_LANES = new Set(["pm", "ta", "qa", "aa", "km", "developer"]);

/** Parse optional lane: omit → undefined (no change on PATCH); null/"" → null; valid string → lane. */
function parseLane(
  raw: unknown,
  opts: { required?: boolean } = {},
): { ok: true; lane: string | null | undefined } | { ok: false } {
  if (raw === undefined) {
    if (opts.required) return { ok: false };
    return { ok: true, lane: undefined };
  }
  if (raw === null || raw === "") return { ok: true, lane: null };
  if (typeof raw === "string" && MEMBER_LANES.has(raw)) return { ok: true, lane: raw };
  return { ok: false };
}

async function fetchProjectMember(db: D1Database, projectId: string, userId: string) {
  return db
    .prepare(
      `SELECT pm.user_id, pm.role, pm.lane, u.email, u.name
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? AND pm.user_id = ?`,
    )
    .bind(projectId, userId)
    .first();
}

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
    ...seedStatusStatements(c.env.DB, id),
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

projectRoutes.get("/projects/:id/statuses", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const statuses = await listProjectStatuses(c.env.DB, id);
  return c.json({ statuses });
});

projectRoutes.put("/projects/:id/statuses", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{
    statuses?: StatusInput[];
    migrate?: Record<string, string>;
  }>();
  const normalized = normalizeStatusList(body.statuses);
  if (!normalized.ok) return c.json({ error: normalized.error }, 400);

  const nextKeys = new Set(normalized.statuses.map((s) => s.key));
  const current = await listProjectStatuses(c.env.DB, id);
  const removed = current.map((s) => s.key).filter((k) => !nextKeys.has(k));
  const migrate = body.migrate ?? {};

  const stmts: D1PreparedStatement[] = [];
  for (const oldKey of removed) {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND status = ?`,
    )
      .bind(id, oldKey)
      .first<{ n: number }>();
    if ((count?.n ?? 0) > 0) {
      const target = migrate[oldKey];
      if (!target || !nextKeys.has(target)) {
        return c.json({ error: "migrate_required", key: oldKey }, 400);
      }
      stmts.push(
        c.env.DB.prepare(
          `UPDATE tickets SET status = ? WHERE project_id = ? AND status = ?`,
        ).bind(target, id, oldKey),
      );
    }
  }

  stmts.push(c.env.DB.prepare(`DELETE FROM project_statuses WHERE project_id = ?`).bind(id));
  for (const s of normalized.statuses) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO project_statuses (project_id, key, label, category, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, s.key, s.label, s.category, s.sort_order),
    );
  }
  await c.env.DB.batch(stmts);

  return c.json({ statuses: await listProjectStatuses(c.env.DB, id) });
});

projectRoutes.get("/projects/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT pm.user_id, pm.role, pm.lane, u.email, u.name
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

  const body = await c.req.json<{
    user_id?: string;
    email?: string;
    role?: string;
    lane?: string | null;
  }>();
  const memberRole = body.role === "owner" || body.role === "member" ? body.role : null;
  if (!memberRole) return c.json({ error: "invalid_input" }, 400);
  const laneParsed = parseLane(body.lane);
  if (!laneParsed.ok) return c.json({ error: "invalid_lane" }, 400);
  const lane = laneParsed.lane === undefined ? null : laneParsed.lane;

  const resolved = await resolveUserId(c.env.DB, body);
  if ("error" in resolved) {
    return c.json({ error: resolved.error }, resolved.error === "invalid_input" ? 400 : 404);
  }
  const userId = resolved.userId;

  const project = await c.env.DB.prepare(`SELECT client_id FROM projects WHERE id = ?`)
    .bind(id)
    .first<{ client_id: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);

  const clientRole = await getClientMembership(c.env.DB, project.client_id, userId);
  if (!clientRole) return c.json({ error: "not_client_member" }, 400);

  await c.env.DB.prepare(
    `INSERT INTO project_members (project_id, user_id, role, lane) VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, lane = excluded.lane`,
  )
    .bind(id, userId, memberRole, lane)
    .run();

  const member = await fetchProjectMember(c.env.DB, id, userId);
  return c.json({ member }, 201);
});

projectRoutes.patch("/projects/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const role = await requireProjectMember(c.env.DB, id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (role !== "owner") return c.json({ error: "forbidden" }, 403);

  const targetRole = await requireProjectMember(c.env.DB, id, targetUserId);
  if (!targetRole) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<{ role?: string; lane?: string | null }>();
  const nextRole =
    body.role === undefined
      ? undefined
      : body.role === "owner" || body.role === "member"
        ? body.role
        : null;
  if (body.role !== undefined && nextRole === null) {
    return c.json({ error: "invalid_input" }, 400);
  }
  const laneParsed = parseLane(body.lane);
  if (!laneParsed.ok) return c.json({ error: "invalid_lane" }, 400);
  if (nextRole === undefined && laneParsed.lane === undefined) {
    return c.json({ error: "invalid_input" }, 400);
  }

  if (nextRole === "member" && targetRole === "owner") {
    const owners = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM project_members WHERE project_id = ? AND role = 'owner'`,
    )
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) return c.json({ error: "last_owner" }, 400);
  }

  if (nextRole !== undefined) {
    await c.env.DB.prepare(
      `UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`,
    )
      .bind(nextRole, id, targetUserId)
      .run();
  }
  if (laneParsed.lane !== undefined) {
    await c.env.DB.prepare(
      `UPDATE project_members SET lane = ? WHERE project_id = ? AND user_id = ?`,
    )
      .bind(laneParsed.lane, id, targetUserId)
      .run();
  }

  const member = await fetchProjectMember(c.env.DB, id, targetUserId);
  return c.json({ member });
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
