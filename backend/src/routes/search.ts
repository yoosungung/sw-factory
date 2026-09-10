import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { requireAuth } from "../middleware/auth";

export const searchRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

searchRoutes.use("*", requireAuth);

searchRoutes.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ error: "invalid_input" }, 400);

  let limit = Number(c.req.query("limit") ?? 20);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;

  const userId = c.get("user").id;
  const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

  const clients = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.description, c.created_by, c.created_at, cm.role
     FROM clients c
     JOIN client_members cm ON cm.client_id = c.id
     WHERE cm.user_id = ? AND c.name LIKE ? ESCAPE '\\'
     ORDER BY c.name COLLATE NOCASE
     LIMIT ?`,
  )
    .bind(userId, like, limit)
    .all();

  const projects = await c.env.DB.prepare(
    `SELECT p.id, p.client_id, p.name, p.description, p.created_by, p.created_at, pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ? AND p.name LIKE ? ESCAPE '\\'
     ORDER BY p.name COLLATE NOCASE
     LIMIT ?`,
  )
    .bind(userId, like, limit)
    .all();

  const tickets = await c.env.DB.prepare(
    `SELECT t.id, t.project_id, t.title, t.description, t.type, t.status, t.priority,
            t.sort_order, t.milestone_id, t.assignee_id, t.due_at, t.date_from, t.date_to,
            t.version, t.created_by, t.created_at, t.updated_at
     FROM tickets t
     JOIN project_members pm ON pm.project_id = t.project_id
     WHERE pm.user_id = ? AND t.title LIKE ? ESCAPE '\\'
     ORDER BY t.updated_at DESC
     LIMIT ?`,
  )
    .bind(userId, like, limit)
    .all();

  return c.json({
    clients: clients.results ?? [],
    projects: projects.results ?? [],
    tickets: tickets.results ?? [],
  });
});
