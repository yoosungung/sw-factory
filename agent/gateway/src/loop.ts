import {
  ensureGatewayDirs,
  loadCheckpoint,
  loadSticky,
  saveCheckpoint,
  saveSticky,
  stickyKey,
} from "./checkpoint";
import { dispatchToCursor } from "./dispatch";
import {
  claimManualPromptFire,
  composeManualPrompt,
} from "./manual-prompt";
import { renderPrompt, promptKindForTarget } from "./prompts";
import { enqueueEventRetry, listRetries, removeRetry } from "./retry";
import { routeEvent } from "./router";
import { pullEvents } from "./tail";
import { resolveTicketNo } from "./ticket-no";
import { deliverTicketless } from "./ticketless";
import type { AgentEvent, GatewayConfig, StickyMap } from "./types";
import type { DispatchResult } from "./dispatch";

export type TickDeps = {
  config: GatewayConfig;
  fetchImpl?: typeof fetch;
};

export type TickResult = {
  processed: number;
  acked_id: string | null;
  /**
   * Cursor session id = `agent_id`.
   * `ticket_id` = event UUID (null when ticketless).
   * `ticket_no` = UI issueKey (e.g. SWF-EA2D); null when ticketless.
   */
  dispatched: Array<{
    event_id: string;
    persona: string;
    agent_id: string;
    ticket_id: string | null;
    ticket_no: string | null;
  }>;
};

/** 409 while a ticket or persona slot is busy: park and let the outbox move. */
function isCapacityHold(result: DispatchResult): boolean {
  if (result.ok || result.ackPoison || result.rebind) return false;
  if (result.status !== 409) return false;
  const reason = result.reason ?? "";
  return reason === "busy" || reason === "skipped_mutex" || reason === "skipped_active_run";
}

async function deliverOne(opts: {
  config: GatewayConfig;
  sticky: StickyMap;
  event: AgentEvent;
  persona: string;
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<"ok" | "retry" | "poison" | "defer"> {
  const key = stickyKey(opts.event.ticket_id ?? "", opts.persona);
  let stickyId = opts.sticky[key] ?? null;

  const tryOnce = async (agentId: string | null) =>
    dispatchToCursor({
      cursorBaseUrl: opts.config.cursorBaseUrl,
      stickyAgentId: agentId,
      persona: opts.persona,
      prompt: opts.prompt,
      event: opts.event,
      fetchImpl: opts.fetchImpl,
    });

  let result = await tryOnce(stickyId);

  if (!result.ok && result.rebind) {
    delete opts.sticky[key];
    result = await tryOnce(null);
  }

  if (result.ok) {
    if (opts.event.ticket_id && result.agent_id) {
      opts.sticky[key] = result.agent_id;
    }
    await removeRetry(opts.config.dataDir, opts.event.ticket_id ?? "", opts.persona);
    return "ok";
  }

  if (result.ackPoison) return "poison";

  const hold = isCapacityHold(result);
  if (result.enqueue && opts.event.ticket_id) {
    await enqueueEventRetry(
      opts.config.dataDir,
      opts.event.ticket_id,
      opts.persona,
      opts.prompt,
      opts.event,
      { hold },
    );
  }
  // Persona may already be at max_active, or this ticket is in flight.
  // Park the prompt and let a different ticket be accepted.
  if (hold) return "defer";
  return "retry";
}

export async function processEvent(
  config: GatewayConfig,
  sticky: StickyMap,
  event: AgentEvent,
  fetchImpl?: typeof fetch,
): Promise<{ allOk: boolean; dispatched: TickResult["dispatched"] }> {
  if (event.event_type === "manual_prompt") {
    return processManualPrompt(config, sticky, event, fetchImpl);
  }

  const targets = routeEvent(event, config.agents);
  const dispatched: TickResult["dispatched"] = [];

  if (targets.length === 0) {
    return { allOk: true, dispatched };
  }

  let deliveredOk = 0;
  let hadRetry = false;
  for (const target of targets) {
    const prompt = renderPrompt(
      config.prompts,
      event,
      promptKindForTarget(event, target.user_id),
    );
    const outcome = await deliverOne({
      config,
      sticky,
      event,
      persona: target.persona,
      prompt,
      fetchImpl,
    });
    if (outcome === "ok") {
      deliveredOk += 1;
      const agent_id = sticky[stickyKey(event.ticket_id ?? "", target.persona)] ?? "";
      const ticket_no = await resolveTicketNo({
        factoryBaseUrl: config.factoryBaseUrl,
        sessionCookie: config.sessionCookie,
        projectId: event.project_id,
        ticketId: event.ticket_id,
        fetchImpl,
      });
      dispatched.push({
        event_id: event.id,
        persona: target.persona,
        agent_id,
        ticket_id: event.ticket_id ?? null,
        ticket_no,
      });
    } else if (outcome === "retry") {
      hadRetry = true;
    }
    // defer: 409 busy/mutex is already in the retry queue. Ack still advances
    // so this persona can accept another ticket up to max_active_per_persona.
    // poison → treat as ok for ack advancement (avoid infinite loop)
  }
  // Block ack only on hard failure (5xx/network) when nothing was accepted.
  const allOk = !(hadRetry && deliveredOk === 0);
  return { allOk, dispatched };
}

async function processManualPrompt(
  config: GatewayConfig,
  sticky: StickyMap,
  event: AgentEvent,
  fetchImpl?: typeof fetch,
): Promise<{ allOk: boolean; dispatched: TickResult["dispatched"] }> {
  const dispatched: TickResult["dispatched"] = [];
  const targets = routeEvent(event, config.agents);
  if (targets.length === 0) {
    return { allOk: true, dispatched };
  }

  const claimed = await claimManualPromptFire(config.dataDir, event);
  if (!claimed) {
    // Identical payload already fired this UTC minute — ack without re-dispatch.
    return { allOk: true, dispatched };
  }

  const prompt = composeManualPrompt(event);
  const target = targets[0]!;
  const ticketless = !event.ticket_id;

  if (ticketless) {
    const outcome = await deliverTicketless({
      config,
      persona: target.persona,
      prompt,
      retryKey: event.id,
      eventType: "manual_prompt",
      payload: event.payload,
      fetchImpl,
    });
    if (outcome.status === "ok") {
      dispatched.push({
        event_id: event.id,
        persona: target.persona,
        agent_id: outcome.agent_id,
        ticket_id: null,
        ticket_no: null,
      });
      return { allOk: true, dispatched };
    }
    if (outcome.status === "retry") {
      return { allOk: false, dispatched };
    }
    return { allOk: true, dispatched };
  }

  const outcome = await deliverOne({
    config,
    sticky,
    event,
    persona: target.persona,
    prompt,
    fetchImpl,
  });
  if (outcome === "ok") {
    const agent_id = sticky[stickyKey(event.ticket_id ?? "", target.persona)] ?? "";
    const ticket_no = await resolveTicketNo({
      factoryBaseUrl: config.factoryBaseUrl,
      sessionCookie: config.sessionCookie,
      projectId: event.project_id,
      ticketId: event.ticket_id,
      fetchImpl,
    });
    dispatched.push({
      event_id: event.id,
      persona: target.persona,
      agent_id,
      ticket_id: event.ticket_id,
      ticket_no,
    });
    return { allOk: true, dispatched };
  }
  if (outcome === "retry") {
    return { allOk: false, dispatched };
  }
  return { allOk: true, dispatched };
}

export async function flushRetries(
  config: GatewayConfig,
  sticky: StickyMap,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const items = await listRetries(config.dataDir);
  for (const item of items) {
    if (item.attempts >= config.retryMaxAttempts) {
      await removeRetry(config.dataDir, item.ticket_id, item.persona);
      continue;
    }
    const ticketless =
      item.event.event_type === "schedule" ||
      item.event.event_type === "catch_up" ||
      (item.event.event_type === "manual_prompt" && !item.event.ticket_id);
    if (ticketless) {
      await deliverTicketless({
        config,
        persona: item.persona,
        prompt: item.prompt,
        retryKey: item.ticket_id,
        eventType: item.event.event_type,
        payload: item.event.payload,
        fetchImpl,
      });
      continue;
    }
    await deliverOne({
      config,
      sticky,
      event: item.event,
      persona: item.persona,
      prompt: item.prompt,
      fetchImpl,
    });
  }
}

export async function tick(deps: TickDeps): Promise<TickResult> {
  const { config } = deps;
  await ensureGatewayDirs(config.dataDir);
  const checkpoint = await loadCheckpoint(config.dataDir);
  const sticky = await loadSticky(config.dataDir);

  const events = await pullEvents({
    factoryBaseUrl: config.factoryBaseUrl,
    sessionCookie: config.sessionCookie,
    afterId: checkpoint.acked_id,
    limit: config.pollLimit,
    fetchImpl: deps.fetchImpl,
  });

  const dispatched: TickResult["dispatched"] = [];
  let acked = checkpoint.acked_id;

  for (const event of events) {
    const result = await processEvent(config, sticky, event, deps.fetchImpl);
    dispatched.push(...result.dispatched);
    if (result.allOk) {
      acked = event.id;
    } else {
      // stop advancing past failed event (at-least-once)
      break;
    }
  }

  await flushRetries(config, sticky, deps.fetchImpl);

  const next = {
    acked_id: acked,
    read_cursor: events.at(-1)?.id ?? checkpoint.read_cursor,
    last_catch_up_at: checkpoint.last_catch_up_at,
  };
  await saveCheckpoint(config.dataDir, next);
  await saveSticky(config.dataDir, sticky);

  return { processed: events.length, acked_id: next.acked_id, dispatched };
}
