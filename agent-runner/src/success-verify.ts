/** Phase 2: verify a run finished AND ended with a successful Leantime mutation. */

import type { SDKMessage } from "@cursor/sdk";

import type { RunControl } from "./run-policy.js";

const LEANTIME_MUTATIONS = ["add_comment", "update_ticket", "create_ticket"] as const;
export type LeantimeMutation = (typeof LEANTIME_MUTATIONS)[number];

const NAME_SEPARATORS = ["_", ".", "/", "-"];

const MCP_INFRA_HINTS = [
  "sticky",
  "discovery",
  "server not",
  "not registered",
  "mcp host",
  "transport error",
  "fastmcp",
  "version mismatch",
  "tools/list",
  "server 미등록",
  "미등록",
];

export interface ToolRecord {
  name: string;
  status: "running" | "completed" | "error";
  args?: unknown;
  result?: unknown;
}

export interface SuccessVerdict {
  ok: boolean;
  reason: string;
}

export interface ToolEvidence {
  observe(message: SDKMessage): void;
  lastCompleted(): ToolRecord | undefined;
  allCompleted(): ToolRecord[];
}

export interface WriteAttestation {
  /** True when a recent write on the active ticket is visible via API. */
  recentWriteOnTicket(ticketId: number, withinMs: number): Promise<boolean>;
}

/**
 * Accumulate tool_call evidence from a run stream. `tool_call` is emitted twice
 * (running then completed/error); args arrive first, results on completion.
 */
export function createToolEvidence(): ToolEvidence {
  const argsByCall = new Map<string, unknown>();
  const completed: ToolRecord[] = [];
  return {
    observe(message: SDKMessage): void {
      if (message.type !== "tool_call") {
        return;
      }
      if (message.args !== undefined) {
        argsByCall.set(message.call_id, message.args);
      }
      if (message.status === "completed" || message.status === "error") {
        completed.push({
          name: message.name,
          status: message.status,
          args: message.args ?? argsByCall.get(message.call_id),
          result: message.result,
        });
      }
    },
    lastCompleted(): ToolRecord | undefined {
      return completed[completed.length - 1];
    },
    allCompleted(): ToolRecord[] {
      return completed.slice();
    },
  };
}

export function matchLeantimeMutation(name: string): LeantimeMutation | undefined {
  const normalized = name.trim().toLowerCase();
  for (const mutation of LEANTIME_MUTATIONS) {
    if (normalized === mutation) {
      return mutation;
    }
    for (const sep of NAME_SEPARATORS) {
      if (normalized.endsWith(sep + mutation)) {
        return mutation;
      }
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** SDK stream name for MCP is `mcp`; IDE-style wrapper may be `CallMcpTool`. */
function isMcpWrapper(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "mcp" || normalized === "callmcptool";
}

/**
 * Resolve the effective Leantime tool name and args. MCP wrappers carry the
 * real tool in `toolName` and params in nested `args` / `arguments`.
 */
export function resolveToolCall(last: ToolRecord): { name: string; args: Record<string, unknown> } {
  const outer = asRecord(last.args);
  if (!isMcpWrapper(last.name)) {
    return { name: last.name, args: outer };
  }
  const toolName = typeof outer.toolName === "string" ? outer.toolName : "";
  const nested = outer.args ?? outer.arguments;
  return {
    name: toolName || last.name,
    args: nested !== undefined ? asRecord(nested) : {},
  };
}

function resultLooksFailed(result: unknown): boolean {
  if (result === false) {
    return true;
  }
  if (typeof result === "string") {
    const trimmed = result.trim().toLowerCase();
    if (trimmed === "false") {
      return true;
    }
    try {
      const parsed = JSON.parse(result) as unknown;
      if (parsed === false) {
        return true;
      }
      if (parsed !== null && typeof parsed === "object" && "error" in parsed) {
        return true;
      }
    } catch {
      // non-JSON string result; treat as opaque success signal
    }
    return false;
  }
  if (result !== null && typeof result === "object" && "error" in result) {
    return true;
  }
  return false;
}

function resultText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result === undefined || result === null) {
    return "";
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export function textLooksLikeMcpInfraFailure(text: string): boolean {
  const lower = text.toLowerCase();
  return MCP_INFRA_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
}

/** True when any completed tool was an MCP Leantime mutation that errored or looked infra-failed. */
export function hadFailedMcpMutation(tools: ToolRecord[]): boolean {
  for (const tool of tools) {
    const resolved = resolveToolCall(tool);
    const mutation = matchLeantimeMutation(resolved.name);
    const isMcp =
      isMcpWrapper(tool.name) ||
      tool.name.toLowerCase().includes("mcp") ||
      tool.name.toLowerCase() === "callmcptool";
    if (!mutation || !isMcp) {
      continue;
    }
    if (tool.status === "error") {
      return true;
    }
    if (resultLooksFailed(tool.result) || textLooksLikeMcpInfraFailure(resultText(tool.result))) {
      return true;
    }
  }
  return false;
}

/**
 * Infra-class verification failures should not burn full corrective re-runs.
 * `last_tool_not_mutation:shell` only counts when the same run already tried MCP write and failed.
 */
export function isInfraFailure(reason: string, tools: ToolRecord[] = []): boolean {
  const lower = reason.toLowerCase();
  if (lower.startsWith("tool_error:mcp") || lower.startsWith("tool_error:callmcptool")) {
    return true;
  }
  if (lower.startsWith("tool_result_failed:") && hadFailedMcpMutation(tools)) {
    return true;
  }
  if (textLooksLikeMcpInfraFailure(reason)) {
    return true;
  }
  if (lower === "last_tool_not_mutation:shell" && hadFailedMcpMutation(tools)) {
    return true;
  }
  if (lower.startsWith("last_tool_not_mutation:mcp") && hadFailedMcpMutation(tools)) {
    return true;
  }
  if (lower.startsWith("last_tool_not_mutation:callmcptool") && hadFailedMcpMutation(tools)) {
    return true;
  }
  return false;
}

/**
 * Verdict = run finished AND the last completed tool call is a successful
 * Leantime mutation on the active ticket (or create_ticket for ticket-less runs).
 */
export function evaluateSuccess(
  runStatus: string,
  last: ToolRecord | undefined,
  ticketId: number | undefined,
  _checks: string[],
): SuccessVerdict {
  if (runStatus !== "finished") {
    return { ok: false, reason: `run_status:${runStatus}` };
  }
  if (!last) {
    return { ok: false, reason: "no_tool_call" };
  }
  if (last.status === "error") {
    return { ok: false, reason: `tool_error:${last.name}` };
  }
  const resolved = resolveToolCall(last);
  const mutation = matchLeantimeMutation(resolved.name);
  if (!mutation) {
    return { ok: false, reason: `last_tool_not_mutation:${last.name}` };
  }
  if (resultLooksFailed(last.result)) {
    return { ok: false, reason: `tool_result_failed:${mutation}` };
  }

  const args = resolved.args;
  if (ticketId === undefined) {
    return mutation === "create_ticket"
      ? { ok: true, reason: "ok" }
      : { ok: false, reason: `no_active_ticket_for:${mutation}` };
  }

  if (mutation === "add_comment") {
    const module = String(args.module ?? "").toLowerCase();
    const moduleId = Number(args.module_id);
    if ((module === "ticket" || module === "tickets") && moduleId === ticketId) {
      return { ok: true, reason: "ok" };
    }
    return { ok: false, reason: `add_comment_target:${args.module_id ?? "?"}` };
  }
  if (mutation === "update_ticket") {
    if (Number(args.ticket_id) === ticketId) {
      return { ok: true, reason: "ok" };
    }
    return { ok: false, reason: `update_ticket_target:${args.ticket_id ?? "?"}` };
  }
  // create_ticket while an active ticket exists does not act on that ticket.
  return { ok: false, reason: "create_ticket_with_active_ticket" };
}

/** Optional API read-after-write: accept when a recent write is already on the ticket. */
export async function confirmWriteViaApi(
  ticketId: number | undefined,
  attester: WriteAttestation | undefined,
  withinMs = 15 * 60 * 1000,
): Promise<SuccessVerdict | null> {
  if (ticketId === undefined || attester === undefined) {
    return null;
  }
  try {
    if (await attester.recentWriteOnTicket(ticketId, withinMs)) {
      return { ok: true, reason: "ok_read_after_write" };
    }
  } catch {
    return null;
  }
  return null;
}

export function verificationEnabled(control?: RunControl | null): boolean {
  return !!control?.success_checks && control.success_checks.length > 0;
}

export function maxVerifyAttempts(control?: RunControl | null): number {
  const configured = control?.success_retry?.max_attempts;
  return typeof configured === "number" && configured >= 0 ? configured : 1;
}

export function composeRetryPrompt(checks: string[], reason: string): string {
  const lines = [
    `Your previous run did not satisfy the success checks (reason: ${reason}).`,
    "If a Leantime write (add_comment / update_ticket / create_ticket) already landed on the Active ticket, do NOT rewrite the same Outcome.",
    "Call get_comments (or get_ticket) to confirm, then finish with one Leantime mutation as the LAST tool only if nothing was recorded yet.",
    "Do not spam duplicate Outcome comments.",
    "Success checks:",
    ...checks.map((check, index) => `${index + 1}. ${check}`),
  ];
  return lines.join("\n");
}
