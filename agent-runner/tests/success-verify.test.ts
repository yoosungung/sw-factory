import { describe, expect, it } from "vitest";
import type { SDKMessage } from "@cursor/sdk";

import {
  composeRetryPrompt,
  createToolEvidence,
  evaluateSuccess,
  matchLeantimeMutation,
  maxVerifyAttempts,
  verificationEnabled,
} from "../src/success-verify.js";

function toolCall(
  partial: Partial<Extract<SDKMessage, { type: "tool_call" }>>,
): SDKMessage {
  return {
    type: "tool_call",
    agent_id: "a1",
    run_id: "r1",
    call_id: partial.call_id ?? "c1",
    name: partial.name ?? "Shell",
    status: partial.status ?? "completed",
    args: partial.args,
    result: partial.result,
  };
}

describe("matchLeantimeMutation", () => {
  it("matches bare and prefixed MCP names by trailing segment", () => {
    expect(matchLeantimeMutation("add_comment")).toBe("add_comment");
    expect(matchLeantimeMutation("mcp_leantime_add_comment")).toBe("add_comment");
    expect(matchLeantimeMutation("mcp_leantime_update_ticket")).toBe("update_ticket");
    expect(matchLeantimeMutation("create_ticket")).toBe("create_ticket");
  });

  it("does not match reads or lookalikes", () => {
    expect(matchLeantimeMutation("get_ticket")).toBeUndefined();
    expect(matchLeantimeMutation("create_ticket_file")).toBeUndefined();
    expect(matchLeantimeMutation("delete_comment")).toBeUndefined();
  });
});

describe("evaluateSuccess CallMcpTool / mcp unwrap", () => {
  const checks = ["Leave add_comment"];

  it("passes when last tool is mcp with toolName add_comment and nested args", () => {
    const last = {
      name: "mcp",
      status: "completed" as const,
      args: {
        toolName: "add_comment",
        providerIdentifier: "user-leantime",
        args: { module: "ticket", module_id: 42, comment: "done" },
      },
      result: "true",
    };
    expect(evaluateSuccess("finished", last, 42, checks)).toEqual({ ok: true, reason: "ok" });
  });

  it("passes when last tool is CallMcpTool with toolName create_ticket (ticket-less)", () => {
    const last = {
      name: "CallMcpTool",
      status: "completed" as const,
      args: {
        toolName: "create_ticket",
        arguments: { headline: "triage", projectId: 16 },
      },
      result: "739",
    };
    expect(evaluateSuccess("finished", last, undefined, checks)).toEqual({
      ok: true,
      reason: "ok",
    });
  });

  it("fails when mcp toolName is a read", () => {
    const last = {
      name: "mcp",
      status: "completed" as const,
      args: { toolName: "get_ticket", args: { ticket_id: 42 } },
      result: "{}",
    };
    expect(evaluateSuccess("finished", last, 42, checks)).toMatchObject({
      ok: false,
      reason: "last_tool_not_mutation:mcp",
    });
  });
});

describe("createToolEvidence", () => {
  it("merges args from running into the completed record", () => {
    const ev = createToolEvidence();
    ev.observe(toolCall({ call_id: "c1", name: "add_comment", status: "running", args: { module: "ticket", module_id: 42 } }));
    ev.observe(toolCall({ call_id: "c1", name: "add_comment", status: "completed", result: "true" }));
    const last = ev.lastCompleted();
    expect(last?.name).toBe("add_comment");
    expect(last?.status).toBe("completed");
    expect(last?.args).toEqual({ module: "ticket", module_id: 42 });
  });

  it("tracks only the last terminal tool call", () => {
    const ev = createToolEvidence();
    ev.observe(toolCall({ call_id: "c1", name: "add_comment", status: "completed" }));
    ev.observe(toolCall({ call_id: "c2", name: "get_ticket", status: "completed" }));
    expect(ev.lastCompleted()?.name).toBe("get_ticket");
  });
});

describe("evaluateSuccess", () => {
  const checks = ["Leave add_comment"];

  it("passes when finished and last tool is add_comment on active ticket", () => {
    const last = { name: "mcp_leantime_add_comment", status: "completed" as const, args: { module: "ticket", module_id: 42 }, result: "true" };
    expect(evaluateSuccess("finished", last, 42, checks).ok).toBe(true);
  });

  it("fails when run status is not finished", () => {
    const last = { name: "add_comment", status: "completed" as const, args: { module: "ticket", module_id: 42 } };
    expect(evaluateSuccess("error", last, 42, checks)).toMatchObject({ ok: false });
  });

  it("fails when there is no tool call", () => {
    expect(evaluateSuccess("finished", undefined, 42, checks).ok).toBe(false);
  });

  it("fails when last tool is a read", () => {
    const last = { name: "get_ticket", status: "completed" as const, args: { ticket_id: 42 } };
    expect(evaluateSuccess("finished", last, 42, checks).ok).toBe(false);
  });

  it("fails when mutation targets a different ticket", () => {
    const last = { name: "add_comment", status: "completed" as const, args: { module: "ticket", module_id: 99 } };
    expect(evaluateSuccess("finished", last, 42, checks).ok).toBe(false);
  });

  it("fails when tool result is false", () => {
    const last = { name: "update_ticket", status: "completed" as const, args: { ticket_id: 42 }, result: "false" };
    expect(evaluateSuccess("finished", last, 42, checks).ok).toBe(false);
  });

  it("fails when tool status is error", () => {
    const last = { name: "add_comment", status: "error" as const, args: { module: "ticket", module_id: 42 } };
    expect(evaluateSuccess("finished", last, 42, checks).ok).toBe(false);
  });

  it("accepts create_ticket only for ticket-less runs", () => {
    const last = { name: "create_ticket", status: "completed" as const, args: {}, result: "123" };
    expect(evaluateSuccess("finished", last, undefined, checks).ok).toBe(true);
    expect(evaluateSuccess("finished", last, 42, checks).ok).toBe(false);
  });

  it("rejects unverifiable comment on ticket-less run", () => {
    const last = { name: "add_comment", status: "completed" as const, args: { module: "ticket", module_id: 5 } };
    expect(evaluateSuccess("finished", last, undefined, checks).ok).toBe(false);
  });
});

describe("verificationEnabled / maxVerifyAttempts", () => {
  it("enabled only when success_checks present", () => {
    expect(verificationEnabled(undefined)).toBe(false);
    expect(verificationEnabled({ success_checks: [] })).toBe(false);
    expect(verificationEnabled({ success_checks: ["x"] })).toBe(true);
  });

  it("defaults max attempts to 3", () => {
    expect(maxVerifyAttempts({ success_checks: ["x"] })).toBe(3);
    expect(maxVerifyAttempts({ success_checks: ["x"], success_retry: { max_attempts: 1 } })).toBe(1);
    expect(maxVerifyAttempts({ success_checks: ["x"], success_retry: { max_attempts: 0 } })).toBe(0);
  });
});

describe("composeRetryPrompt", () => {
  it("includes reason and checks and demands a final Leantime write", () => {
    const out = composeRetryPrompt(["Leave add_comment"], "last_tool_not_mutation:get_ticket");
    expect(out).toContain("last_tool_not_mutation:get_ticket");
    expect(out).toContain("Leave add_comment");
    expect(out.toLowerCase()).toContain("add_comment");
  });
});
