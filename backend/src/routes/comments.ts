import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { newId, nowIso } from "../lib/crypto";
import { requireAuth, requireProjectMember } from "../middleware/auth";

export const commentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

commentRoutes.use("/tickets/*", requireAuth);
commentRoutes.use("/comments/*", requireAuth);

async function ticketProjectId(db: D1Database, ticketId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT project_id FROM tickets WHERE id = ?`)
    .bind(ticketId)
    .first<{ project_id: string }>();
  return row?.project_id ?? null;
}

commentRoutes.get("/tickets/:ticketId/comments", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const projectId = await ticketProjectId(c.env.DB, ticketId);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.entity_type, c.entity_id, c.body, c.author_id, c.created_at, u.name AS author_name
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
  const projectId = await ticketProjectId(c.env.DB, ticketId);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{ body?: string }>();
  const text = body.body?.trim();
  if (!text) return c.json({ error: "invalid_input" }, 400);

  const id = newId();
  const created_at = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO comments (id, entity_type, entity_id, body, author_id, created_at)
     VALUES (?, 'ticket', ?, ?, ?, ?)`,
  )
    .bind(id, ticketId, text, user.id, created_at)
    .run();

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
      },
    },
    201,
  );
});

commentRoutes.delete("/comments/:id", async (c) => {
  const user = c.get("user");
  const comment = await c.env.DB.prepare(
    `SELECT id, entity_id, author_id FROM comments WHERE id = ? AND entity_type = 'ticket'`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; entity_id: string; author_id: string }>();
  if (!comment) return c.json({ error: "not_found" }, 404);

  const projectId = await ticketProjectId(c.env.DB, comment.entity_id);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (comment.author_id !== user.id && role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  await c.env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(comment.id).run();
  return c.json({ ok: true });
});
