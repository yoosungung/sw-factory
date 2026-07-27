import { describe, expect, it, vi } from "vitest";

import type { SDKMessage } from "@cursor/sdk";
import type { Run } from "@cursor/sdk";

import {
  MAX_LOG_FIELD_CHARS,
  summarizeSdkMessage,
  streamRunLogs,
  truncateForLog,
} from "../src/run-logger.js";

describe("truncateForLog", () => {
  it("returns short strings unchanged", () => {
    expect(truncateForLog("hello")).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "x".repeat(MAX_LOG_FIELD_CHARS + 10);
    const out = truncateForLog(long);
    expect(out.length).toBeLessThanOrEqual(MAX_LOG_FIELD_CHARS + 3);
    expect(out.endsWith("...")).toBe(true);
  });
});

describe("summarizeSdkMessage", () => {
  it("summarizes assistant text", () => {
    const message: SDKMessage = {
      type: "assistant",
      agent_id: "a1",
      run_id: "r1",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Working on ticket 42" }],
      },
    };
    expect(summarizeSdkMessage(message)).toEqual({
      message_type: "assistant",
      text: "Working on ticket 42",
    });
  });

  it("summarizes tool_call", () => {
    const message: SDKMessage = {
      type: "tool_call",
      agent_id: "a1",
      run_id: "r1",
      call_id: "c1",
      name: "Shell",
      status: "completed",
      args: { command: "npm test" },
      result: "ok",
    };
    expect(summarizeSdkMessage(message)).toMatchObject({
      message_type: "tool_call",
      tool_name: "Shell",
      tool_status: "completed",
    });
  });

  it("summarizes status lifecycle", () => {
    const message: SDKMessage = {
      type: "status",
      agent_id: "a1",
      run_id: "r1",
      status: "RUNNING",
    };
    expect(summarizeSdkMessage(message)).toEqual({
      message_type: "status",
      lifecycle_status: "RUNNING",
    });
  });
});

describe("streamRunLogs", () => {
  it("does not log streamed SDK chunks", async () => {
    const messages: SDKMessage[] = [
      {
        type: "assistant",
        agent_id: "agent-1",
        run_id: "run-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "하면" }],
        },
      },
      {
        type: "assistant",
        agent_id: "agent-1",
        run_id: "run-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: " 됩니다." }],
        },
      },
      {
        type: "usage",
        agent_id: "agent-1",
        run_id: "run-1",
        usage: { inputTokens: 1, outputTokens: 2 },
      },
      {
        type: "status",
        agent_id: "agent-1",
        run_id: "run-1",
        status: "FINISHED",
      },
    ];

    const run = {
      id: "run-1",
      requestId: "req-1",
      agentId: "agent-1",
      status: "running",
      stream: async function* () {
        for (const message of messages) {
          yield message;
        }
      },
      wait: async () => ({
        id: "run-1",
        status: "finished" as const,
        durationMs: 83697,
        result: "하면 됩니다.",
      }),
      supports: () => true,
      unsupportedReason: () => undefined,
      cancel: async () => {},
      onDidChangeStatus: () => () => {},
    } satisfies Run;

    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await streamRunLogs(run, {
      agentId: "agent-1",
      runId: "run-1",
      ticketId: 160,
    });

    expect(result.status).toBe("finished");
    const events = info.mock.calls.map(
      (call) => JSON.parse(String(call[0])) as { event: string; result_preview?: string },
    );
    expect(events.map((p) => p.event)).toEqual(["run.started", "run.completed"]);
    expect(events[1]?.result_preview).toBe("하면 됩니다.");

    info.mockRestore();
  });

  it("logs run completion with usage and duration", async () => {
    const run = {
      id: "run-1",
      requestId: "req-1",
      agentId: "agent-1",
      status: "running",
      stream: async function* () {
        yield {
          type: "status",
          agent_id: "agent-1",
          run_id: "run-1",
          status: "RUNNING",
        } satisfies SDKMessage;
      },
      wait: async () => ({
        id: "run-1",
        status: "finished" as const,
        durationMs: 1200,
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
      supports: () => true,
      unsupportedReason: () => undefined,
      cancel: async () => {},
      onDidChangeStatus: () => () => {},
    } satisfies Run;

    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await streamRunLogs(run, {
      agentId: "agent-1",
      runId: "run-1",
      ticketId: 99,
      event: "comment_added",
      control: { budget: { max_turns: 8, timeout_ms: 45000 } },
    });

    expect(result.status).toBe("finished");
    const completed = info.mock.calls
      .map(
        (call) =>
          JSON.parse(String(call[0])) as {
            event: string;
            duration_ms?: number;
            budget_max_turns?: number;
            budget_timeout_ms?: number;
          },
      )
      .find((p) => p.event === "run.completed");
    expect(completed).toMatchObject({
      event: "run.completed",
      duration_ms: 1200,
      budget_max_turns: 8,
      budget_timeout_ms: 45000,
    });

    info.mockRestore();
  });
});
