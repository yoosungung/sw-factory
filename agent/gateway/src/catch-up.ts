import { loadCheckpoint, saveCheckpoint } from "./checkpoint";
import { catchUpRetryKey } from "./schedule";
import { deliverTicketless } from "./ticketless";
import type { GatewayConfig } from "./types";

const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;

export function lookbackSince(
  lastCatchUpAt: string | null,
  now = new Date(),
): string {
  if (lastCatchUpAt) return lastCatchUpAt;
  return new Date(now.getTime() - FORTY_EIGHT_H_MS).toISOString();
}

export function renderCatchUpPrompt(
  template: string,
  lookback: string,
): string {
  return template.replaceAll("{lookback_since}", lookback);
}

export async function runCatchUp(opts: {
  config: GatewayConfig;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<{ dispatched: string[]; lookback_since: string }> {
  const now = opts.now ?? new Date();
  const checkpoint = await loadCheckpoint(opts.config.dataDir);
  const lookback = lookbackSince(checkpoint.last_catch_up_at, now);
  const prompt = renderCatchUpPrompt(opts.config.prompts.catch_up, lookback);
  const dispatched: string[] = [];

  for (const agent of opts.config.agents) {
    if (agent.type !== "sessions") continue;
    await deliverTicketless({
      config: opts.config,
      persona: agent.persona,
      prompt,
      retryKey: catchUpRetryKey(agent.persona),
      eventType: "catch_up",
      fetchImpl: opts.fetchImpl,
    });
    dispatched.push(agent.persona);
  }

  await saveCheckpoint(opts.config.dataDir, {
    ...checkpoint,
    last_catch_up_at: now.toISOString(),
  });

  return { dispatched, lookback_since: lookback };
}
