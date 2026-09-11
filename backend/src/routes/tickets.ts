import { Hono } from "hono";
import type {
  AppVariables,
  Env,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "../env";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "../env";
import { newId, nowIso } from "../lib/crypto";
import { appendAgentEvent } from "../lib/agent-events";
import { requireAuth, requireProjectMember } from "../middleware/auth";

type TicketRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  sort_order: number;
  milestone_id: string | null;
  assignee_id: string | null;
  due_at: string | null;
  date_from: string | null;
  date_to: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const TICKET_SELECT = `id, project_id, title, description, type, status, priority, sort_order,
              milestone_id, assignee_id, due_at, date_from, date_to, version,
              created_by, created_at, updated_at`;

export const ticketRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

ticketRoutes.use("/projects/*", requireAuth);
ticketRoutes.use("/tickets/*", requireAuth);

async function loadTicket(db: D1Database, id: string): Promise<TicketRow | null> {
  return db
    .prepare(`SELECT ${TICKET_SELECT} FROM tickets WHERE id = ?`)
    .bind(id)
    .first<TicketRow>();
}

function isValidPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as string[]).includes(value);
}

ticketRoutes.get("/projects/:projectId/tickets", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const type = c.req.query("type");
  const status = c.req.query("status");
  const assigneeId = c.req.query("assignee_id");
  const createdBy = c.req.query("created_by");
  const limitRaw = Number(c.req.query("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
    : 50;
  const cursor = c.req.query("cursor");

  let sql = `SELECT ${TICKET_SELECT} FROM tickets WHERE project_id = ?`;
  const binds: (string | number)[] = [projectId];
  if (type) {
    sql += ` AND type = ?`;
    binds.push(type);
  }
  if (status) {
    sql += ` AND status = ?`;
    binds.push(status);
  }
  if (assigneeId) {
    const resolvedAssignee = assigneeId === "me" ? user.id : assigneeId;
    sql += ` AND assignee_id = ?`;
    binds.push(resolvedAssignee);
  }
  if (createdBy) {
    const resolvedCreator = createdBy === "me" ? user.id : createdBy;
    sql += ` AND created_by = ?`;
    binds.push(resolvedCreator);
  }
  if (cursor) {
    try {
      const decoded = JSON.parse(atob(cursor)) as { created_at: string; id: string };
      sql += ` AND (created_at > ? OR (created_at = ? AND id > ?))`;
      binds.push(decoded.created_at, decoded.created_at, decoded.id);
    } catch {
      return c.json({ error: "invalid_cursor" }, 400);
    }
  }
  sql += ` ORDER BY created_at ASC, id ASC LIMIT ?`;
  binds.push(limit + 1);

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<TicketRow>();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const next_cursor =
    hasMore && last
      ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id }))
      : null;

  return c.json({ tickets: page, next_cursor });
});

ticketRoutes.post("/projects/:projectId/tickets", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{
    title?: string;
    description?: string;
    type?: TicketType;
    status?: TicketStatus;
    priority?: TicketPriority;
    assignee_id?: string | null;
    due_at?: string | null;
    milestone_id?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }>();

  const title = body.title?.trim();
  const type = body.type ?? "task";
  const status = body.status ?? "backlog";
  const priority = body.priority ?? "medium";
  if (!title || (type !== "task" && type !== "milestone")) {
    return c.json({ error: "invalid_input" }, 400);
  }
  if (!TICKET_STATUSES.includes(status) || !isValidPriority(priority)) {
    return c.json({ error: "invalid_input" }, 400);
  }

  if (body.assignee_id) {
    const assigneeMember = await requireProjectMember(
      c.env.DB,
      projectId,
      body.assignee_id,
    );
    if (!assigneeMember) return c.json({ error: "invalid_assignee" }, 400);
  }

  const max = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM tickets WHERE project_id = ? AND status = ?`,
  )
    .bind(projectId, status)
    .first<{ m: number }>();

  const id = newId();
  const ts = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO tickets (
      id, project_id, title, description, type, status, priority, sort_order,
      milestone_id, assignee_id, due_at, date_from, date_to, version,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  )
    .bind(
      id,
      projectId,
      title,
      body.description?.trim() ?? "",
      type,
      status,
      priority,
      (max?.m ?? -1) + 1,
      body.milestone_id ?? null,
      body.assignee_id ?? null,
      body.due_at ?? null,
      body.date_from ?? null,
      body.date_to ?? null,
      user.id,
      ts,
      ts,
    )
    .run();

  await appendAgentEvent(c.env.DB, {
    event_type: "ticket_created",
    ticket_id: id,
    project_id: projectId,
    actor_user_id: user.id,
    assignee_user_id: body.assignee_id ?? null,
    at: ts,
  });

  const ticket = await loadTicket(c.env.DB, id);
  return c.json({ ticket }, 201);
});

ticketRoutes.get("/tickets/:id", async (c) => {
  const user = c.get("user");
  const ticket = await loadTicket(c.env.DB, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  return c.json({ ticket });
});

ticketRoutes.patch("/tickets/:id", async (c) => {
  const user = c.get("user");
  const ticket = await loadTicket(c.env.DB, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{
    title?: string;
    description?: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    sort_order?: number;
    assignee_id?: string | null;
    due_at?: string | null;
    milestone_id?: string | null;
    date_from?: string | null;
    date_to?: string | null;
    version?: number;
  }>();

  if (body.version !== undefined && body.version !== ticket.version) {
    return c.json({ error: "conflict", current_version: ticket.version }, 409);
  }

  if (body.status !== undefined && !TICKET_STATUSES.includes(body.status)) {
    return c.json({ error: "invalid_input" }, 400);
  }
  if (body.priority !== undefined && !isValidPriority(body.priority)) {
    return c.json({ error: "invalid_input" }, 400);
  }

  if (body.assignee_id) {
    const assigneeMember = await requireProjectMember(
      c.env.DB,
      ticket.project_id,
      body.assignee_id,
    );
    if (!assigneeMember) return c.json({ error: "invalid_assignee" }, 400);
  }

  const next = {
    title: body.title?.trim() ?? ticket.title,
    description: body.description !== undefined ? body.description.trim() : ticket.description,
    status: body.status ?? ticket.status,
    priority: body.priority ?? ticket.priority,
    sort_order: body.sort_order ?? ticket.sort_order,
    assignee_id: body.assignee_id !== undefined ? body.assignee_id : ticket.assignee_id,
    due_at: body.due_at !== undefined ? body.due_at : ticket.due_at,
    milestone_id: body.milestone_id !== undefined ? body.milestone_id : ticket.milestone_id,
    date_from: body.date_from !== undefined ? body.date_from : ticket.date_from,
    date_to: body.date_to !== undefined ? body.date_to : ticket.date_to,
  };

  const tracked: Array<{ field: string; old_val: string | null; new_val: string | null }> = [];
  const track = (field: string, oldVal: unknown, newVal: unknown) => {
    const o = oldVal == null ? null : String(oldVal);
    const n = newVal == null ? null : String(newVal);
    if (o !== n) tracked.push({ field, old_val: o, new_val: n });
  };
  track("title", ticket.title, next.title);
  track("description", ticket.description, next.description);
  track("status", ticket.status, next.status);
  track("priority", ticket.priority, next.priority);
  track("sort_order", ticket.sort_order, next.sort_order);
  track("assignee_id", ticket.assignee_id, next.assignee_id);
  track("due_at", ticket.due_at, next.due_at);
  track("milestone_id", ticket.milestone_id, next.milestone_id);
  track("date_from", ticket.date_from, next.date_from);
  track("date_to", ticket.date_to, next.date_to);

  const updated_at = nowIso();
  const newVersion = ticket.version + 1;

  let updateSql = `UPDATE tickets SET title = ?, description = ?, status = ?, priority = ?, sort_order = ?,
     assignee_id = ?, due_at = ?, milestone_id = ?, date_from = ?, date_to = ?,
     version = ?, updated_at = ? WHERE id = ?`;
  const updateBinds: (string | number | null)[] = [
    next.title,
    next.description,
    next.status,
    next.priority,
    next.sort_order,
    next.assignee_id,
    next.due_at,
    next.milestone_id,
    next.date_from,
    next.date_to,
    newVersion,
    updated_at,
    ticket.id,
  ];

  if (body.version !== undefined) {
    updateSql += ` AND version = ?`;
    updateBinds.push(body.version);
  }

  const result = await c.env.DB.prepare(updateSql).bind(...updateBinds).run();
  if (body.version !== undefined && (result.meta.changes ?? 0) === 0) {
    return c.json({ error: "conflict", current_version: ticket.version }, 409);
  }

  if (tracked.length > 0) {
    await c.env.DB.batch(
      tracked.map((t) =>
        c.env.DB.prepare(
          `INSERT INTO ticket_activities (id, ticket_id, actor_id, field, old_val, new_val, at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(newId(), ticket.id, user.id, t.field, t.old_val, t.new_val, updated_at),
      ),
    );

    await appendAgentEvent(c.env.DB, {
      event_type: "ticket_updated",
      ticket_id: ticket.id,
      project_id: ticket.project_id,
      actor_user_id: user.id,
      assignee_user_id: next.assignee_id,
      payload: { changed_fields: tracked.map((t) => t.field) },
      at: updated_at,
    });
  }

  return c.json({ ticket: await loadTicket(c.env.DB, ticket.id) });
});

ticketRoutes.get("/tickets/:id/activities", async (c) => {
  const user = c.get("user");
  const ticket = await loadTicket(c.env.DB, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT id, ticket_id, actor_id, field, old_val, new_val, at
     FROM ticket_activities WHERE ticket_id = ?
     ORDER BY at DESC, id DESC`,
  )
    .bind(ticket.id)
    .all();

  return c.json({ activities: results });
});

ticketRoutes.delete("/tickets/:id", async (c) => {
  const user = c.get("user");
  const ticket = await loadTicket(c.env.DB, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const canDelete = ticket.created_by === user.id || role === "owner";
  if (!canDelete) return c.json({ error: "forbidden" }, 403);

  await appendAgentEvent(c.env.DB, {
    event_type: "ticket_deleted",
    ticket_id: ticket.id,
    project_id: ticket.project_id,
    actor_user_id: user.id,
    assignee_user_id: ticket.assignee_id,
  });

  await c.env.DB.prepare(`DELETE FROM tickets WHERE id = ?`).bind(ticket.id).run();
  return c.json({ ok: true });
});

ticketRoutes.get("/projects/:projectId/kanban", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const includeArchived = c.req.query("include_archived") === "true";
  const cutoff = new Date(Date.now() - 14 * 86400_000).toISOString();

  let sql = `SELECT ${TICKET_SELECT} FROM tickets WHERE project_id = ? AND type = 'task'`;
  const binds: string[] = [projectId];
  if (!includeArchived) {
    sql += ` AND (status != 'done' OR updated_at >= ?)`;
    binds.push(cutoff);
  }
  sql += ` ORDER BY sort_order ASC, created_at ASC`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<TicketRow>();

  const columns: Record<TicketStatus, TicketRow[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    done: [],
  };
  for (const t of results ?? []) {
    if (columns[t.status]) columns[t.status].push(t);
  }
  return c.json({ columns });
});

ticketRoutes.get("/projects/:projectId/timeline", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT ${TICKET_SELECT} FROM tickets
     WHERE project_id = ? AND date_from IS NOT NULL AND date_to IS NOT NULL
     ORDER BY date_from ASC`,
  )
    .bind(projectId)
    .all();

  return c.json({ items: results });
});
