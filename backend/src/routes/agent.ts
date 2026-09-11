import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { requireAuth } from "../middleware/auth";

type AgentEventRow = {
  id: string;
  at: string;
  event_type: string;
  ticket_id: string | null;
  project_id: string | null;
  actor_user_id: string;
  assignee_user_id: string | null;
  payload_json: string;
};

export const agentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

agentRoutes.use("/*", requireAuth);

agentRoutes.get("/events", async (c) => {
  const afterId = c.req.query("after_id")?.trim() || null;
  const limitRaw = Number(c.req.query("limit") ?? "100");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 500)
    : 100;

  let sql = `SELECT id, at, event_type, ticket_id, project_id,
                    actor_user_id, assignee_user_id, payload_json
             FROM agent_event_log`;
  const binds: (string | number)[] = [];

  if (afterId) {
    const anchor = await c.env.DB.prepare(
      `SELECT at FROM agent_event_log WHERE id = ?`,
    )
      .bind(afterId)
      .first<{ at: string }>();
    if (!anchor) return c.json({ error: "invalid_after_id" }, 400);
    sql += ` WHERE (at > ? OR (at = ? AND id > ?))`;
    binds.push(anchor.at, anchor.at, afterId);
  }

  sql += ` ORDER BY at ASC, id ASC LIMIT ?`;
  binds.push(limit);

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<AgentEventRow>();

  const events = (results ?? []).map((row) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload_json || "{}") as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return {
      id: row.id,
      at: row.at,
      event_type: row.event_type,
      ticket_id: row.ticket_id,
      project_id: row.project_id,
      actor_user_id: row.actor_user_id,
      assignee_user_id: row.assignee_user_id,
      payload,
    };
  });

  return c.json({ events });
});
