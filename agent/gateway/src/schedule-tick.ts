import { cronMatches, fireKey } from "./cron";
import { fetchFlowGates } from "./flow-gates";
import {
  composeSchedulePrompt,
  evaluateGates,
  resolveScheduleAgents,
  scheduleRetryKey,
} from "./schedule";
import { claimScheduleFire } from "./schedule-fires";
import { deliverTicketless } from "./ticketless";
import type { GatewayConfig } from "./types";

export type ScheduleTickResult = {
  minute: string;
  fired: Array<{ schedule_id: string; persona: string }>;
  skipped: Array<{ schedule_id: string; reason: string }>;
};

export async function tickSchedules(opts: {
  config: GatewayConfig;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<ScheduleTickResult> {
  const now = opts.now ?? new Date();
  const minute = fireKey(now);
  const fired: ScheduleTickResult["fired"] = [];
  const skipped: ScheduleTickResult["skipped"] = [];
  const schedules = opts.config.schedules ?? [];
  if (schedules.length === 0) {
    return { minute, fired, skipped };
  }

  let snapshot: Awaited<ReturnType<typeof fetchFlowGates>> | undefined;

  for (const schedule of schedules) {
    if (!cronMatches(schedule.cron, now)) {
      skipped.push({ schedule_id: schedule.id, reason: "cron" });
      continue;
    }

    const needsGates = (schedule.gates ?? []).length > 0;
    if (needsGates && snapshot === undefined) {
      snapshot = await fetchFlowGates({
        factoryBaseUrl: opts.config.factoryBaseUrl,
        sessionCookie: opts.config.sessionCookie,
        fetchImpl: opts.fetchImpl,
      });
    }
    if (!evaluateGates(schedule.gates, needsGates ? (snapshot ?? null) : null)) {
      skipped.push({ schedule_id: schedule.id, reason: "gate" });
      continue;
    }

    const claimed = await claimScheduleFire(
      opts.config.dataDir,
      schedule.id,
      minute,
    );
    if (!claimed) {
      skipped.push({ schedule_id: schedule.id, reason: "dedupe" });
      continue;
    }

    const targets = resolveScheduleAgents(schedule, opts.config.agents);
    if (targets.length === 0) {
      skipped.push({ schedule_id: schedule.id, reason: "no_agents" });
      continue;
    }

    const prompt = composeSchedulePrompt(
      schedule,
      opts.config.successChecks ?? [],
    );
    for (const target of targets) {
      await deliverTicketless({
        config: opts.config,
        persona: target.persona,
        prompt,
        retryKey: scheduleRetryKey(schedule.id),
        eventType: "schedule",
        payload: { schedule_id: schedule.id },
        fetchImpl: opts.fetchImpl,
      });
      fired.push({ schedule_id: schedule.id, persona: target.persona });
    }
  }

  return { minute, fired, skipped };
}
