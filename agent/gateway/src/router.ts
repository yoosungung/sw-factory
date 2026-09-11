import type { AgentEvent, PersonaConfig } from "./types";

function sessionsAgents(agents: PersonaConfig[]): PersonaConfig[] {
  return agents.filter((a) => a.type === "sessions");
}

function byUserId(agents: PersonaConfig[], userId: string | null | undefined) {
  if (!userId) return null;
  return sessionsAgents(agents).find((a) => a.user_id === userId) ?? null;
}

function mentionUserIds(event: AgentEvent): string[] {
  const raw = event.payload?.mention_user_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

/**
 * Route an outbox event to sessions personas (assignee + mentions), applying self-echo skip.
 */
export function routeEvent(
  event: AgentEvent,
  agents: PersonaConfig[],
): PersonaConfig[] {
  if (event.event_type === "ticket_deleted") {
    return [];
  }

  const targets = new Map<string, PersonaConfig>();
  const assignee = byUserId(agents, event.assignee_user_id);
  if (assignee) targets.set(assignee.persona, assignee);

  for (const uid of mentionUserIds(event)) {
    const mentioned = byUserId(agents, uid);
    if (mentioned) targets.set(mentioned.persona, mentioned);
  }

  // self-echo: bot actor on their own assigned ticket, with no other mentions → skip actor
  const actorBot = byUserId(agents, event.actor_user_id);
  if (
    actorBot &&
    event.assignee_user_id === event.actor_user_id &&
    mentionUserIds(event).every((uid) => uid === event.actor_user_id)
  ) {
    targets.delete(actorBot.persona);
  }

  return [...targets.values()];
}
