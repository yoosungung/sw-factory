import { newId, nowIso } from "./crypto";

export type AgentEventType =
  | "ticket_created"
  | "ticket_updated"
  | "ticket_deleted"
  | "comment_added";

export type AppendAgentEventInput = {
  event_type: AgentEventType;
  ticket_id: string | null;
  project_id: string | null;
  actor_user_id: string;
  assignee_user_id?: string | null;
  payload?: Record<string, unknown>;
  at?: string;
};

export async function appendAgentEvent(
  db: D1Database,
  input: AppendAgentEventInput,
): Promise<string> {
  const id = newId();
  const at = input.at ?? nowIso();
  await db
    .prepare(
      `INSERT INTO agent_event_log (
        id, at, event_type, ticket_id, project_id,
        actor_user_id, assignee_user_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      at,
      input.event_type,
      input.ticket_id,
      input.project_id,
      input.actor_user_id,
      input.assignee_user_id ?? null,
      JSON.stringify(input.payload ?? {}),
    )
    .run();
  return id;
}
