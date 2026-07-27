import type { Run, RunResult } from "@cursor/sdk";
import type { SDKMessage } from "@cursor/sdk";

import { budgetLogFields, type RunControl } from "./run-policy.js";

export const MAX_LOG_FIELD_CHARS = 500;

export interface RunLogContext {
  agentId: string;
  runId: string;
  ticketId?: number;
  event?: string;
  control?: RunControl;
  /** Verification retry index (0 = initial run). */
  attempt?: number;
}

function logJson(level: "info" | "error", fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}

/** Structured run-scoped log line (shared with the worker verification loop). */
export function logRunEvent(
  fields: Record<string, unknown>,
  level: "info" | "error" = "info",
): void {
  logJson(level, fields);
}

export function truncateForLog(value: string, max = MAX_LOG_FIELD_CHARS): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}

function truncateUnknown(value: unknown, max = MAX_LOG_FIELD_CHARS): unknown {
  if (typeof value === "string") {
    return truncateForLog(value, max);
  }
  if (value === undefined || value === null) {
    return value;
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= max) {
      return value;
    }
    return truncateForLog(serialized, max);
  } catch {
    return truncateForLog(String(value), max);
  }
}

export function summarizeSdkMessage(message: SDKMessage): Record<string, unknown> {
  switch (message.type) {
    case "assistant": {
      const parts: string[] = [];
      const tools: string[] = [];
      for (const block of message.message.content) {
        if (block.type === "text") {
          parts.push(block.text);
        } else if (block.type === "tool_use") {
          tools.push(block.name);
        }
      }
      return {
        message_type: "assistant",
        ...(parts.length > 0
          ? { text: truncateForLog(parts.join("\n")) }
          : {}),
        ...(tools.length > 0 ? { tool_uses: tools } : {}),
      };
    }
    case "tool_call":
      return {
        message_type: "tool_call",
        tool_name: message.name,
        tool_status: message.status,
        call_id: message.call_id,
        ...(message.args !== undefined
          ? { args: truncateUnknown(message.args, 300) }
          : {}),
        ...(message.result !== undefined
          ? { result: truncateUnknown(message.result, 300) }
          : {}),
        ...(message.truncated ? { truncated: message.truncated } : {}),
      };
    case "thinking":
      return {
        message_type: "thinking",
        text: truncateForLog(message.text),
        ...(message.thinking_duration_ms !== undefined
          ? { thinking_duration_ms: message.thinking_duration_ms }
          : {}),
      };
    case "status":
      return {
        message_type: "status",
        lifecycle_status: message.status,
        ...(message.message ? { detail: truncateForLog(message.message) } : {}),
      };
    case "usage":
      return {
        message_type: "usage",
        usage: message.usage,
      };
    case "task":
      return {
        message_type: "task",
        ...(message.status ? { task_status: message.status } : {}),
        ...(message.text ? { text: truncateForLog(message.text) } : {}),
      };
    case "system":
      return {
        message_type: "system",
        subtype: message.subtype,
        ...(message.model ? { model: message.model } : {}),
        ...(message.tools ? { tools: message.tools } : {}),
      };
    case "user":
      return {
        message_type: "user",
        text: truncateForLog(
          message.message.content.map((block) => block.text).join("\n"),
        ),
      };
    case "request":
      return {
        message_type: "request",
        request_id: message.request_id,
      };
    default: {
      const exhaustive: never = message;
      return { message_type: (exhaustive as SDKMessage).type };
    }
  }
}

export async function streamRunLogs(
  run: Run,
  context: RunLogContext,
  onMessage?: (message: SDKMessage) => void,
): Promise<RunResult> {
  logJson("info", {
    event: "run.started",
    agent_id: context.agentId,
    run_id: context.runId,
    ...(context.ticketId !== undefined ? { ticket_id: context.ticketId } : {}),
    ...(context.event ? { trigger_event: context.event } : {}),
    ...(context.attempt ? { attempt: context.attempt } : {}),
    ...budgetLogFields(context.control),
  });

  if (run.supports("stream")) {
    try {
      // Drain the stream so run.wait() can finish; per-chunk logs are unreadable noise.
      for await (const message of run.stream()) {
        onMessage?.(message);
      }
    } catch (error) {
      logJson("error", {
        event: "run.stream.failed",
        agent_id: context.agentId,
        run_id: context.runId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } else {
    logJson("info", {
      event: "run.stream.unsupported",
      agent_id: context.agentId,
      run_id: context.runId,
      reason: run.unsupportedReason("stream"),
    });
  }

  const result = await run.wait();
  logJson(result.status === "error" ? "error" : "info", {
    event: "run.completed",
    agent_id: context.agentId,
    run_id: context.runId,
    ...(context.ticketId !== undefined ? { ticket_id: context.ticketId } : {}),
    ...(context.attempt ? { attempt: context.attempt } : {}),
    status: result.status,
    ...(result.durationMs !== undefined ? { duration_ms: result.durationMs } : {}),
    ...(result.usage !== undefined ? { usage: result.usage } : {}),
    ...budgetLogFields(context.control),
    ...(result.error
      ? { error: truncateForLog(result.error.message), error_code: result.error.code }
      : {}),
    ...(result.result
      ? { result_preview: truncateForLog(result.result) }
      : {}),
  });
  return result;
}
