import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { appendAgentEvent } from "../lib/agent-events";
import { nowIso } from "../lib/crypto";
import { requireAuth, requireProjectMember } from "../middleware/auth";

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTargetUserId(
  db: D1Database,
  projectId: string,
  target: string,
): Promise<string | null> {
  const byName = await db
    .prepare(
      `SELECT u.id
       FROM users u
       JOIN project_members pm ON pm.user_id = u.id
       WHERE pm.project_id = ? AND LOWER(u.name) = LOWER(?)
       LIMIT 1`,
    )
    .bind(projectId, target)
    .first<{ id: string }>();
  if (byName) return byName.id;

  if (!UUID_RE.test(target)) return null;

  const byId = await db
    .prepare(
      `SELECT u.id
       FROM users u
       JOIN project_members pm ON pm.user_id = u.id
       WHERE pm.project_id = ? AND u.id = ?
       LIMIT 1`,
    )
    .bind(projectId, target)
    .first<{ id: string }>();
  return byId?.id ?? null;
}

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

agentRoutes.get("/flow-gates", async (c) => {
  const inProgress = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM tickets WHERE status = 'in_progress' LIMIT 1`,
  ).first<{ ok: number }>();
  const flowActive = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM tickets
     WHERE status IN ('in_progress', 'review', 'deploying_test', 'qa', 'deploying_prod')
     LIMIT 1`,
  ).first<{ ok: number }>();
  return c.json({
    in_progress: !!inProgress,
    flow_active: !!flowActive,
  });
});

agentRoutes.post("/prompts", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) as {
    project_id?: unknown;
    target?: unknown;
    prompt?: unknown;
    ticket_id?: unknown;
  } | null;

  const projectId =
    typeof body?.project_id === "string" ? body.project_id.trim() : "";
  const target = typeof body?.target === "string" ? body.target.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const ticketIdRaw =
    body?.ticket_id === undefined || body?.ticket_id === null
      ? null
      : typeof body.ticket_id === "string"
        ? body.ticket_id.trim()
        : "";

  if (!projectId || !target || typeof body?.prompt !== "string" || !prompt.trim()) {
    return c.json({ error: "invalid_body" }, 400);
  }
  if (ticketIdRaw === "") {
    return c.json({ error: "invalid_body" }, 400);
  }

  const callerRole = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!callerRole) return c.json({ error: "forbidden" }, 403);

  const targetUserId = await resolveTargetUserId(c.env.DB, projectId, target);
  if (!targetUserId) return c.json({ error: "invalid_target" }, 400);

  let ticketId: string | null = ticketIdRaw;
  if (ticketId) {
    const ticket = await c.env.DB.prepare(
      `SELECT id FROM tickets WHERE id = ? AND project_id = ?`,
    )
      .bind(ticketId, projectId)
      .first<{ id: string }>();
    if (!ticket) return c.json({ error: "invalid_ticket" }, 400);
  }

  const at = nowIso();
  const id = await appendAgentEvent(c.env.DB, {
    event_type: "manual_prompt",
    ticket_id: ticketId,
    project_id: projectId,
    actor_user_id: user.id,
    assignee_user_id: targetUserId,
    payload: {
      prompt,
      target,
      target_user_id: targetUserId,
    },
    at,
  });

  return c.json({ id, at }, 201);
});
