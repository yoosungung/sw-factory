import { createHash } from "node:crypto";
import { fireKey } from "./cron";
import { claimScheduleFire, releaseScheduleFire } from "./schedule-fires";
import type { AgentEvent, PersonaConfig } from "./types";

function manualPromptClaimId(event: AgentEvent): string {
  return `manual_prompt:${manualPromptFingerprint(event)}`;
}

function sessionsAgents(agents: PersonaConfig[]): PersonaConfig[] {
  return agents.filter((a) => a.type === "sessions");
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/** Resolve sessions persona for a manual_prompt outbox event. */
export function resolveManualPromptTarget(
  event: AgentEvent,
  agents: PersonaConfig[],
): PersonaConfig | null {
  const sessions = sessionsAgents(agents);
  const payload = event.payload ?? {};

  const targetUserId =
    typeof payload.target_user_id === "string" && payload.target_user_id
      ? payload.target_user_id
      : null;
  if (targetUserId) {
    return sessions.find((a) => a.user_id === targetUserId) ?? null;
  }

  const targetRaw =
    typeof payload.target_name === "string" && payload.target_name
      ? payload.target_name
      : typeof payload.target === "string" && payload.target
        ? payload.target
        : null;

  if (targetRaw) {
    if (looksLikeUuid(targetRaw)) {
      return sessions.find((a) => a.user_id === targetRaw) ?? null;
    }
    return (
      sessions.find((a) => a.name === targetRaw || a.persona === targetRaw) ??
      null
    );
  }

  if (event.assignee_user_id) {
    return sessions.find((a) => a.user_id === event.assignee_user_id) ?? null;
  }
  return null;
}

export function composeManualPrompt(event: AgentEvent): string {
  const raw = event.payload?.prompt;
  const base = typeof raw === "string" ? raw.trim() : "";
  if (!event.ticket_id) return base;
  if (base.includes(`Active ticket_id=${event.ticket_id}`)) return base;
  return base ? `${base}\n\nActive ticket_id=${event.ticket_id}` : `Active ticket_id=${event.ticket_id}`;
}

export function manualPromptFingerprint(event: AgentEvent): string {
  const target = String(
    event.payload?.target_user_id ??
      event.payload?.target_name ??
      event.payload?.target ??
      event.assignee_user_id ??
      "",
  );
  const prompt = String(event.payload?.prompt ?? "");
  const ticket = event.ticket_id ?? "";
  return createHash("sha256")
    .update(`${target}\0${ticket}\0${prompt}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Dedupe identical (target, ticket, prompt) within the same UTC minute
 * by reusing schedule claim files.
 */
export async function claimManualPromptFire(
  dataDir: string,
  event: AgentEvent,
  now: Date = new Date(),
): Promise<boolean> {
  return claimScheduleFire(dataDir, manualPromptClaimId(event), fireKey(now));
}

/** Release claim after a failed delivery so the same minute can retry. */
export async function releaseManualPromptFire(
  dataDir: string,
  event: AgentEvent,
  now: Date = new Date(),
): Promise<void> {
  await releaseScheduleFire(dataDir, manualPromptClaimId(event), fireKey(now));
}
