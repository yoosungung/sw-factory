import type { AgentEvent, PromptTemplates } from "./types";

export function renderPrompt(
  templates: PromptTemplates,
  event: AgentEvent,
  kind?: keyof PromptTemplates,
): string {
  const key =
    kind ??
    (event.event_type === "ticket_created"
      ? "ticket_created"
      : event.event_type === "ticket_updated"
        ? "ticket_updated"
        : event.event_type === "comment_added"
          ? "comment_added"
          : "ticket_updated");

  const changed = Array.isArray(event.payload?.changed_fields)
    ? (event.payload.changed_fields as string[])
    : [];
  const templateKey: keyof PromptTemplates =
    key === "ticket_updated" && changed.includes("assignee_id")
      ? "assignee_changed"
      : key;

  const template =
    templates[templateKey] ??
    templates.ticket_updated ??
    "Active ticket_id={ticket_id}";

  return template
    .replaceAll("{ticket_id}", event.ticket_id ?? "")
    .replaceAll("{lookback_since}", "")
    .replaceAll("{event_type}", event.event_type);
}
