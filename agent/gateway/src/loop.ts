import {
  ensureGatewayDirs,
  loadCheckpoint,
  loadSticky,
  saveCheckpoint,
  saveSticky,
  stickyKey,
} from "./checkpoint";
import { dispatchToCursor } from "./dispatch";
import { renderPrompt } from "./prompts";
import { enqueueEventRetry, listRetries, removeRetry } from "./retry";
import { routeEvent } from "./router";
import { pullEvents } from "./tail";
import type { AgentEvent, GatewayConfig, StickyMap } from "./types";

export type TickDeps = {
  config: GatewayConfig;
  fetchImpl?: typeof fetch;
};

export type TickResult = {
  processed: number;
  acked_id: string | null;
  dispatched: Array<{ event_id: string; persona: string; agent_id: string }>;
};

async function deliverOne(opts: {
  config: GatewayConfig;
  sticky: StickyMap;
  event: AgentEvent;
  persona: string;
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<"ok" | "retry" | "poison"> {
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

  if (result.enqueue && opts.event.ticket_id) {
    await enqueueEventRetry(
      opts.config.dataDir,
      opts.event.ticket_id,
      opts.persona,
      opts.prompt,
      opts.event,
    );
  }
  return "retry";
}

export async function processEvent(
  config: GatewayConfig,
  sticky: StickyMap,
  event: AgentEvent,
  fetchImpl?: typeof fetch,
): Promise<{ allOk: boolean; dispatched: TickResult["dispatched"] }> {
  const targets = routeEvent(event, config.agents);
  const dispatched: TickResult["dispatched"] = [];

  if (targets.length === 0) {
    return { allOk: true, dispatched };
  }

  let deliveredOk = 0;
  let hadRetry = false;
  for (const target of targets) {
    const prompt = renderPrompt(config.prompts, event);
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
      dispatched.push({ event_id: event.id, persona: target.persona, agent_id });
    } else if (outcome === "retry") {
      hadRetry = true;
    }
    // poison → treat as ok for ack advancement (avoid infinite loop)
  }
  // Block ack only when nothing accepted. If assignee accepted but @mention hit
  // ticket mutex, mention stays in retry and outbox can move on.
  const allOk = !(hadRetry && deliveredOk === 0);
  return { allOk, dispatched };
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
