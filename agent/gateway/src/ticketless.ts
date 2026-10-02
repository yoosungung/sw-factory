import { dispatchToCursor } from "./dispatch";
import { enqueueEventRetry, removeRetry } from "./retry";
import type { AgentEvent, GatewayConfig } from "./types";

export type TicketlessResult =
  | { status: "ok"; agent_id: string }
  | { status: "retry" | "poison" };

export async function deliverTicketless(opts: {
  config: GatewayConfig;
  persona: string;
  prompt: string;
  retryKey: string;
  eventType: string;
  payload?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<TicketlessResult> {
  const event: AgentEvent = {
    id: opts.retryKey,
    at: new Date().toISOString(),
    event_type: opts.eventType,
    ticket_id: null,
    project_id: null,
    actor_user_id: "",
    assignee_user_id: null,
    payload: opts.payload ?? {},
  };

  const result = await dispatchToCursor({
    cursorBaseUrl: opts.config.cursorBaseUrl,
    stickyAgentId: null,
    persona: opts.persona,
    prompt: opts.prompt,
    event,
    fetchImpl: opts.fetchImpl,
  });

  if (result.ok) {
    await removeRetry(opts.config.dataDir, opts.retryKey, opts.persona);
    return { status: "ok", agent_id: result.agent_id };
  }
  if (result.ackPoison) return { status: "poison" };
  if (result.enqueue) {
    await enqueueEventRetry(
      opts.config.dataDir,
      opts.retryKey,
      opts.persona,
      opts.prompt,
      event,
    );
  }
  return { status: "retry" };
}
