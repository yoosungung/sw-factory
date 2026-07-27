/** Phase 2: verify a run finished AND ended with a successful Leantime mutation. */

import type { SDKMessage } from "@cursor/sdk";

import type { RunControl } from "./run-policy.js";

const LEANTIME_MUTATIONS = ["add_comment", "update_ticket", "create_ticket"] as const;
export type LeantimeMutation = (typeof LEANTIME_MUTATIONS)[number];

const NAME_SEPARATORS = ["_", ".", "/", "-"];

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
}

/**
 * Accumulate tool_call evidence from a run stream. `tool_call` is emitted twice
 * (running then completed/error); args arrive first, results on completion.
 */
export function createToolEvidence(): ToolEvidence {
  const argsByCall = new Map<string, unknown>();
  let last: ToolRecord | undefined;
  return {
    observe(message: SDKMessage): void {
      if (message.type !== "tool_call") {
        return;
      }
      if (message.args !== undefined) {
        argsByCall.set(message.call_id, message.args);
      }
      if (message.status === "completed" || message.status === "error") {
        last = {
          name: message.name,
          status: message.status,
          args: message.args ?? argsByCall.get(message.call_id),
          result: message.result,
        };
      }
    },
    lastCompleted(): ToolRecord | undefined {
      return last;
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

export function verificationEnabled(control?: RunControl | null): boolean {
  return !!control?.success_checks && control.success_checks.length > 0;
}

export function maxVerifyAttempts(control?: RunControl | null): number {
  const configured = control?.success_retry?.max_attempts;
  return typeof configured === "number" && configured >= 0 ? configured : 3;
}

export function composeRetryPrompt(checks: string[], reason: string): string {
  const lines = [
    `Your previous run did not satisfy the success checks (reason: ${reason}).`,
    "Before finishing you MUST complete the required Leantime write on the active ticket " +
      "(add_comment or update_ticket), or create_ticket for a scheduled run, and that Leantime call MUST be the LAST tool you use.",
    "Success checks:",
    ...checks.map((check, index) => `${index + 1}. ${check}`),
  ];
  return lines.join("\n");
}
