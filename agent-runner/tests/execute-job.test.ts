import { describe, expect, it, vi } from "vitest";
import type { Run, RunResult, SDKAgent, SDKMessage } from "@cursor/sdk";

import { doneLooksAuthStale } from "../src/stale-auth.js";
import { executeJob, type WorkerSdk } from "../src/worker/execute-job.js";

function makeRun(result: RunResult): Run {
  return {
    id: result.id,
    requestId: result.requestId ?? result.id,
    agentId: "agent-1",
    status: result.status === "finished" ? "finished" : "error",
    supports: () => false,
    unsupportedReason: () => "fake",
    stream: async function* () {},
    conversation: async () => [],
    wait: async () => result,
    cancel: async () => {},
    onDidChangeStatus: () => () => {},
  };
}

function toolCall(name: string, extra: Partial<Extract<SDKMessage, { type: "tool_call" }>> = {}): SDKMessage {
  return {
    type: "tool_call",
    agent_id: "agent-1",
    run_id: "run",
    call_id: extra.call_id ?? name,
    name,
    status: extra.status ?? "completed",
    args: extra.args,
    result: extra.result,
  };
}

/** Stream-capable run that emits tool_call messages then finishes. */
function makeStreamRun(id: string, status: RunResult["status"], messages: SDKMessage[]): Run {
  return {
    id,
    requestId: id,
    agentId: "agent-1",
    status: status === "finished" ? "finished" : "error",
    supports: (cap: string) => cap === "stream",
    unsupportedReason: () => undefined,
    stream: async function* () {
      for (const message of messages) {
        yield message;
      }
    },
    conversation: async () => [],
    wait: async () => ({ id, status, result: "done" }) as RunResult,
    cancel: async () => {},
    onDidChangeStatus: () => () => {},
  };
}

function makeAgent(agentId: string, sendImpl: SDKAgent["send"]): SDKAgent {
  return {
    agentId,
    model: undefined,
    send: sendImpl,
    close: vi.fn(),
    reload: async () => {},
    [Symbol.asyncDispose]: async () => {},
    listArtifacts: async () => [],
    downloadArtifact: async () => Buffer.alloc(0),
  };
}

describe("executeJob", () => {
  it("create: accepts after send, then returns done and closes handle", async () => {
    const accepted: string[] = [];
    const agent = makeAgent("agent-new", async () =>
      makeRun({
        id: "run-1",
        status: "finished",
        result: "hello",
      }),
    );
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("should not resume");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-1",
        type: "create",
        prompt: "hi",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 1,
      },
      sdk,
      (msg) => {
        accepted.push(msg.agentId);
      },
    );

    expect(accepted).toEqual(["agent-new"]);
    expect(result).toMatchObject({
      phase: "done",
      agentId: "agent-new",
      runId: "run-1",
      status: "finished",
      resultPreview: "hello",
    });
    expect(agent.close).toHaveBeenCalled();
  });

  it("prompt: resumes with settingSources so MCP can load", async () => {
    const agent = makeAgent("agent-old", async () =>
      makeRun({ id: "run-2", status: "finished", result: "ok" }),
    );
    const sdk: WorkerSdk = {
      create: async () => {
        throw new Error("no create");
      },
      resume: async (id, options) => {
        expect(id).toBe("agent-old");
        expect(options?.local?.settingSources).toEqual(["user", "project"]);
        expect(options?.local?.cwd).toBe("/tmp");
        return agent;
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-2",
        type: "prompt",
        agentId: "agent-old",
        prompt: "follow up",
        model: "composer-2.5",
        workspace: "/tmp",
      },
      sdk,
    );

    expect(result).toMatchObject({
      phase: "done",
      agentId: "agent-old",
      status: "finished",
    });
  });

  it("injects budget preamble before send", async () => {
    let sentPrompt = "";
    const agent = makeAgent("agent-budget", async (prompt) => {
      sentPrompt = String(prompt);
      return makeRun({ id: "run-b", status: "finished", result: "ok" });
    });
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    await executeJob(
      {
        requestId: "req-b",
        type: "create",
        prompt: "ship it",
        model: "composer-2.5",
        workspace: "/tmp",
        control: {
          budget: { max_turns: 12 },
          policy: { deny: ["force-push"] },
        },
      },
      sdk,
    );

    expect(sentPrompt).toContain("about 12 tool/model turns");
    expect(sentPrompt).toContain("force-push");
    expect(sentPrompt.endsWith("ship it")).toBe(true);
  });

  it("maps auth send failure to WorkerFailed", async () => {
    const sdk: WorkerSdk = {
      create: async () =>
        makeAgent("a", async () => {
          throw new Error(
            "Authentication error If you are logged in, try logging out and back in.",
          );
        }),
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    await expect(
      executeJob(
        {
          requestId: "req-3",
          type: "create",
          prompt: "x",
          model: "composer-2.5",
          workspace: "/tmp",
        },
        sdk,
      ),
    ).rejects.toMatchObject({ phase: "failed", code: "auth" });
  });

  it("verify: passes when finished run ends with add_comment on active ticket", async () => {
    const send = vi.fn(async () =>
      makeStreamRun("run-v1", "finished", [
        toolCall("get_ticket", { call_id: "c1", args: { id: 42 } }),
        toolCall("mcp_leantime_add_comment", {
          call_id: "c2",
          status: "running",
          args: { module: "ticket", module_id: 42, comment: "done" },
        }),
        toolCall("mcp_leantime_add_comment", { call_id: "c2", result: "true" }),
      ]),
    );
    const agent = makeAgent("agent-v", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-v1",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
        control: { success_checks: ["Leave add_comment"], success_retry: { max_attempts: 2 } },
      },
      sdk,
      undefined,
      { writeAttestation: null },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ phase: "done", status: "finished", runId: "run-v1" });
  });

  it("verify: retries in same session then succeeds", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamRun("run-a", "finished", [
          toolCall("get_ticket", { call_id: "c1", args: { id: 42 } }),
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamRun("run-b", "finished", [
          toolCall("mcp_leantime_add_comment", {
            call_id: "c2",
            args: { module: "ticket", module_id: 42 },
            result: "true",
          }),
        ]),
      );
    const agent = makeAgent("agent-v", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-v2",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
        control: { success_checks: ["Leave add_comment"], success_retry: { max_attempts: 2 } },
      },
      sdk,
      undefined,
      { writeAttestation: null },
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ phase: "done", status: "finished", runId: "run-b" });
  });

  it("verify: returns verification_failed after exhausting retries", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamRun("run-a", "finished", [
          toolCall("get_ticket", { call_id: "c1", args: { id: 42 } }),
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamRun("run-b", "finished", [
          toolCall("Shell", { call_id: "c2", args: { command: "echo" }, result: "ok" }),
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamRun("run-c", "finished", [
          toolCall("Read", { call_id: "c3", args: { path: "x" }, result: "x" }),
        ]),
      );
    const agent = makeAgent("agent-v", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-v3",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
        control: { success_checks: ["Leave add_comment"], success_retry: { max_attempts: 2 } },
      },
      sdk,
      undefined,
      { writeAttestation: null },
    );

    expect(send).toHaveBeenCalledTimes(3); // initial + 2 retries (distinct reasons)
    expect(result).toMatchObject({ phase: "done", status: "verification_failed" });
  });

  it("verify: infra MCP failure aborts without retry and sets mcpStickyReset", async () => {
    const send = vi.fn(async () =>
      makeStreamRun("run-mcp-fail", "finished", [
        toolCall("mcp", {
          call_id: "c1",
          status: "error",
          args: { toolName: "add_comment", args: { module: "ticket", module_id: 42 } },
          result: "discovery failed / server not registered",
        }),
      ]),
    );
    const agent = makeAgent("agent-v", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-infra",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
        control: { success_checks: ["Leave add_comment"], success_retry: { max_attempts: 3 } },
      },
      sdk,
      undefined,
      { writeAttestation: null },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      phase: "done",
      status: "verification_failed",
      mcpStickyReset: true,
      ticketId: 42,
    });
  });

  it("verify: read-after-write attestation skips retry", async () => {
    const send = vi.fn(async () =>
      makeStreamRun("run-read", "finished", [
        toolCall("get_ticket", { call_id: "c1", args: { id: 42 } }),
      ]),
    );
    const agent = makeAgent("agent-v", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-attest",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
        control: { success_checks: ["Leave add_comment"], success_retry: { max_attempts: 2 } },
      },
      sdk,
      undefined,
      {
        writeAttestation: {
          recentWriteOnTicket: async () => true,
        },
      },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ phase: "done", status: "finished" });
  });

  it("verify: same reason after retry stops early", async () => {
    const send = vi.fn(async () =>
      makeStreamRun("run-same", "finished", [
        toolCall("get_ticket", { call_id: "c1", args: { id: 42 } }),
      ]),
    );
    const agent = makeAgent("agent-v", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-same",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
        control: { success_checks: ["Leave add_comment"], success_retry: { max_attempts: 3 } },
      },
      sdk,
      undefined,
      { writeAttestation: null },
    );

    expect(send).toHaveBeenCalledTimes(2); // initial + one retry then same-reason stop
    expect(result).toMatchObject({ phase: "done", status: "verification_failed" });
  });

  it("verify: no success_checks means no verification or retry", async () => {
    const send = vi.fn(async () =>
      makeStreamRun("run-plain", "finished", [
        toolCall("get_ticket", { call_id: "c1" }),
      ]),
    );
    const agent = makeAgent("agent-plain", send as unknown as SDKAgent["send"]);
    const sdk: WorkerSdk = {
      create: async () => agent,
      resume: async () => {
        throw new Error("no");
      },
      delete: async () => {},
    };

    const result = await executeJob(
      {
        requestId: "req-v4",
        type: "create",
        prompt: "handle it",
        model: "composer-2.5",
        workspace: "/tmp",
        ticketId: 42,
      },
      sdk,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ phase: "done", status: "finished" });
  });

  it("doneLooksAuthStale detects in-band auth error", () => {
    expect(
      doneLooksAuthStale({
        requestId: "r",
        phase: "done",
        agentId: "a",
        runId: "u",
        status: "error",
        error:
          "Authentication error If you are logged in, try logging out and back in.",
      }),
    ).toBe(true);
  });

  it("delete: cancelRun non-terminal runs before sdk.delete (zombie unlock)", async () => {
    const cancelled: string[] = [];
    const deleted: string[] = [];
    let deleteAttempts = 0;
    const sdk: WorkerSdk = {
      create: async () => {
        throw new Error("no create");
      },
      resume: async () => {
        throw new Error("no resume");
      },
      listRuns: async () => ({
        items: [
          { id: "run-done", currentStatus: "finished" },
          { id: "run-zombie", currentStatus: "running" },
        ],
      }),
      cancelRun: async (runId) => {
        cancelled.push(runId);
      },
      delete: async (agentId) => {
        deleteAttempts += 1;
        if (deleteAttempts === 1 && cancelled.length === 0) {
          throw new Error(
            `Cannot delete agent ${agentId}: active run run-zombie is not terminal. Call run.cancel() first.`,
          );
        }
        deleted.push(agentId);
      },
    };

    const result = await executeJob(
      {
        requestId: "req-del",
        type: "delete",
        agentId: "agent-z",
        model: "composer-2.5",
        workspace: "/tmp/ws",
      },
      sdk,
    );

    expect(cancelled).toEqual(["run-zombie"]);
    expect(deleted).toEqual(["agent-z"]);
    expect(result).toEqual({
      phase: "deleted",
      requestId: "req-del",
      agentId: "agent-z",
    });
  });

  it("delete: parses active-run id from delete error when listRuns misses it", async () => {
    const cancelled: string[] = [];
    let deleteAttempts = 0;
    const sdk: WorkerSdk = {
      create: async () => {
        throw new Error("no create");
      },
      resume: async () => {
        throw new Error("no resume");
      },
      listRuns: async () => ({ items: [] }),
      cancelRun: async (runId) => {
        cancelled.push(runId);
      },
      delete: async (agentId) => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          throw new Error(
            `Cannot delete agent ${agentId}: active run run-6e736208-c176-4fa8-b81a-b76d5a94e33e is not terminal. Call run.cancel() first.`,
          );
        }
      },
    };

    const result = await executeJob(
      {
        requestId: "req-del2",
        type: "delete",
        agentId: "agent-64f92546",
        model: "composer-2.5",
        workspace: "/tmp/ws",
      },
      sdk,
    );

    expect(cancelled).toEqual([
      "run-6e736208-c176-4fa8-b81a-b76d5a94e33e",
    ]);
    expect(deleteAttempts).toBe(2);
    expect(result).toMatchObject({ phase: "deleted", agentId: "agent-64f92546" });
  });
});
