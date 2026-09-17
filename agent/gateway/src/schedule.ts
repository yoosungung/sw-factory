import type { LoadedSchedule } from "../../shared/load-config";
import type { PersonaConfig } from "./types";

export type FlowGates = {
  in_progress: boolean;
  flow_active: boolean;
};

const SUPPORTED_GATES = new Set(["in_progress", "flow_active"]);

export function resolveScheduleAgents(
  schedule: LoadedSchedule,
  agents: PersonaConfig[],
): PersonaConfig[] {
  const sessions = agents.filter((a) => a.type === "sessions");
  const names = schedule.agents;
  if (!names || names.length === 0) return sessions;
  const byName = new Map(sessions.map((a) => [a.name, a]));
  const out: PersonaConfig[] = [];
  for (const name of names) {
    const hit = byName.get(name);
    if (hit) out.push(hit);
  }
  return out;
}

export function composeSchedulePrompt(
  schedule: LoadedSchedule,
  globalChecks: string[] = [],
): string {
  const checks = [...(schedule.success_checks ?? []), ...globalChecks].filter(
    (c) => c.trim(),
  );
  if (checks.length === 0) return schedule.prompt;
  return `${schedule.prompt}\n\nSuccess checks:\n${checks.map((c) => `- ${c}`).join("\n")}`;
}

/** Empty gates always pass. Unknown gate names fail-closed. Missing snapshot fails supported gates. */
export function evaluateGates(
  gates: string[] | undefined,
  snapshot: FlowGates | null,
): boolean {
  const list = gates ?? [];
  if (list.length === 0) return true;
  for (const g of list) {
    if (!SUPPORTED_GATES.has(g)) return false;
  }
  if (!snapshot) return false;
  for (const g of list) {
    if (g === "in_progress" && !snapshot.in_progress) return false;
    if (g === "flow_active" && !snapshot.flow_active) return false;
  }
  return true;
}

export function scheduleRetryKey(scheduleId: string): string {
  return `sched:${scheduleId}`;
}

export function catchUpRetryKey(persona: string): string {
  return `catch_up:${persona}`;
}
