import { dispatchToCursor } from "./dispatch";
import { enqueueEventRetry, removeRetry } from "./retry";
import type { AgentEvent, GatewayConfig } from "./types";

export async function deliverTicketless(opts: {
  config: GatewayConfig;
  persona: string;
  prompt: string;
  retryKey: string;
  eventType: string;
  payload?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<"ok" | "retry" | "poison"> {
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
    return "ok";
  }
  if (result.ackPoison) return "poison";
  if (result.enqueue) {
    await enqueueEventRetry(
      opts.config.dataDir,
      opts.retryKey,
      opts.persona,
      opts.prompt,
      event,
    );
  }
  return "retry";
}
