import type { AgentEvent, PromptTemplates } from "./types";

function mentionUserIds(event: AgentEvent): string[] {
  const raw = event.payload?.mention_user_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function changedFields(event: AgentEvent): string[] {
  const raw = event.payload?.changed_fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

/** Pick prompt template for a routed target (mention-only vs assignee handoff). */
export function promptKindForTarget(
  event: AgentEvent,
  targetUserId: string,
): keyof PromptTemplates {
  const mentions = mentionUserIds(event);
  const isMention = mentions.includes(targetUserId);
  const isAssignee = event.assignee_user_id === targetUserId;
  const assigneeChanged = changedFields(event).includes("assignee_id");

  if (isMention && !isAssignee) return "mention";
  if (assigneeChanged && isAssignee) return "handoff";
  if (event.event_type === "ticket_created") return "ticket_created";
  if (event.event_type === "comment_added") return "comment_added";
  if (event.event_type === "ticket_updated") {
    return assigneeChanged ? "assignee_changed" : "ticket_updated";
  }
  return "ticket_updated";
}

export function renderPrompt(
  templates: PromptTemplates,
  event: AgentEvent,
  kind?: keyof PromptTemplates,
): string {
  const templateKey = kind ?? promptKindForTarget(event, event.assignee_user_id ?? "");
  const resolved: keyof PromptTemplates =
    templateKey === "handoff" && !templates.handoff ? "assignee_changed" : templateKey;

  const template =
    templates[resolved] ??
    templates.ticket_updated ??
    "Active ticket_id={ticket_id}";

  return template
    .replaceAll("{ticket_id}", event.ticket_id ?? "")
    .replaceAll("{lookback_since}", "")
    .replaceAll("{event_type}", event.event_type);
}
