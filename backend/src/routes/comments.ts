import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { newId, nowIso } from "../lib/crypto";
import { appendAgentEvent } from "../lib/agent-events";
import { resolveMentionUserIds } from "../lib/mentions";
import { requireAuth, requireProjectMember } from "../middleware/auth";

export const commentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

commentRoutes.use("/tickets/*", requireAuth);
commentRoutes.use("/comments/*", requireAuth);

async function loadTicketMeta(
  db: D1Database,
  ticketId: string,
): Promise<{ project_id: string; assignee_id: string | null } | null> {
  return db
    .prepare(`SELECT project_id, assignee_id FROM tickets WHERE id = ?`)
    .bind(ticketId)
    .first<{ project_id: string; assignee_id: string | null }>();
}

commentRoutes.get("/tickets/:ticketId/comments", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const ticket = await loadTicketMeta(c.env.DB, ticketId);
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.entity_type, c.entity_id, c.body, c.author_id, c.created_at, c.updated_at, u.name AS author_name
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.entity_type = 'ticket' AND c.entity_id = ?
     ORDER BY c.created_at ASC`,
  )
    .bind(ticketId)
    .all();

  return c.json({ comments: results });
});

commentRoutes.post("/tickets/:ticketId/comments", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const ticket = await loadTicketMeta(c.env.DB, ticketId);
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{ body?: string }>();
  const text = body.body?.trim();
  if (!text) return c.json({ error: "invalid_input" }, 400);

  const id = newId();
  const created_at = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO comments (id, entity_type, entity_id, body, author_id, created_at, updated_at)
     VALUES (?, 'ticket', ?, ?, ?, ?, ?)`,
  )
    .bind(id, ticketId, text, user.id, created_at, created_at)
    .run();

  const mention_user_ids = await resolveMentionUserIds(c.env.DB, ticket.project_id, text);

  await appendAgentEvent(c.env.DB, {
    event_type: "comment_added",
    ticket_id: ticketId,
    project_id: ticket.project_id,
    actor_user_id: user.id,
    assignee_user_id: ticket.assignee_id,
    payload: { comment_id: id, mention_user_ids },
    at: created_at,
  });

  return c.json(
    {
      comment: {
        id,
        entity_type: "ticket",
        entity_id: ticketId,
        body: text,
        author_id: user.id,
        author_name: user.name,
        created_at,
        updated_at: created_at,
      },
    },
    201,
  );
});

commentRoutes.patch("/comments/:id", async (c) => {
  const user = c.get("user");
  const comment = await c.env.DB.prepare(
    `SELECT id, entity_id, author_id, created_at FROM comments WHERE id = ? AND entity_type = 'ticket'`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; entity_id: string; author_id: string; created_at: string }>();
  if (!comment) return c.json({ error: "not_found" }, 404);

  const ticket = await loadTicketMeta(c.env.DB, comment.entity_id);
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (comment.author_id !== user.id && role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json<{ body?: string }>();
  const text = body.body?.trim();
  if (!text) return c.json({ error: "invalid_input" }, 400);

  const updated_at = nowIso();
  await c.env.DB.prepare(`UPDATE comments SET body = ?, updated_at = ? WHERE id = ?`)
    .bind(text, updated_at, comment.id)
    .run();

  const author = await c.env.DB.prepare(`SELECT name FROM users WHERE id = ?`)
    .bind(comment.author_id)
    .first<{ name: string }>();

  return c.json({
    comment: {
      id: comment.id,
      entity_type: "ticket",
      entity_id: comment.entity_id,
      body: text,
      author_id: comment.author_id,
      author_name: author?.name ?? user.name,
      created_at: comment.created_at,
      updated_at,
    },
  });
});

commentRoutes.delete("/comments/:id", async (c) => {
  const user = c.get("user");
  const comment = await c.env.DB.prepare(
    `SELECT id, entity_id, author_id FROM comments WHERE id = ? AND entity_type = 'ticket'`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; entity_id: string; author_id: string }>();
  if (!comment) return c.json({ error: "not_found" }, 404);

  const ticket = await loadTicketMeta(c.env.DB, comment.entity_id);
  if (!ticket) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, ticket.project_id, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (comment.author_id !== user.id && role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  await c.env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(comment.id).run();
  return c.json({ ok: true });
});
