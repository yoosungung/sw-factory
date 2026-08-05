import { describe, expect, it, vi } from "vitest";

import { loadSettings } from "../src/config.js";
import type { WorkerDone } from "../src/job-types.js";
import {
  ActiveRunError,
  SdkBackend,
  type RunPool,
} from "../src/session-manager.js";

function settings() {
  return loadSettings({
    ...process.env,
    AGENT_RUNNER_MOCK: "0",
    CURSOR_API_KEY: "test-key",
    AGENT_RUNNER_MODEL: "composer-2.5",
    WORKSPACE: "/tmp/workspace",
    PORT: "8080",
  });
}

function mockPool(handlers: {
  submit: RunPool["submit"];
  delete?: RunPool["delete"];
}): RunPool {
  return {
    start: async () => {},
    close: async () => {},
    submit: handlers.submit,
    delete: handlers.delete ?? (async () => {}),
  };
}

describe("SdkBackend recovery (R1–R3)", () => {
  it("R1: create.failed forgets ticket mapping so next create is fresh", async () => {
    const agents: string[] = [];
    let failDone!: (reason: unknown) => void;
    const pool = mockPool({
      submit: async (job) => {
        if (job.type === "create") {
          const agentId = `agent-${agents.length + 1}`;
          agents.push(agentId);
          if (agents.length === 1) {
            const done = new Promise<WorkerDone>((_res, rej) => {
              failDone = rej;
            });
            return { agentId, runId: "run-1", done };
          }
          return {
            agentId,
            runId: "run-2",
            done: Promise.resolve({
              requestId: "2",
              phase: "done",
              agentId,
              runId: "run-2",
              status: "finished",
            }),
          };
        }
        throw new Error(`unexpected ${job.type}`);
      },
      delete: async () => {},
    });

    const logs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((msg) => {
      logs.push(String(msg));
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(String(msg));
    });

    const backend = new SdkBackend(settings(), pool);
    const first = await backend.create("hello", 172);
    expect(first.agentId).toBe("agent-1");

    failDone(new Error("worker w1 exited during job"));
    await vi.waitFor(() => {
      expect(logs.some((l) => l.includes("session.create.failed"))).toBe(true);
      expect(logs.some((l) => l.includes("session.recover"))).toBe(true);
    });

    const second = await backend.create("resume", 172);
    expect(second.agentId).toBe("agent-2");
    expect(agents).toEqual(["agent-1", "agent-2"]);

    spy.mockRestore();
    logSpy.mockRestore();
  });

  it("R2: SDK active_run on sticky ticket recovers and creates new agent", async () => {
    const calls: string[] = [];
    let deleted: string[] = [];
    const pool = mockPool({
      submit: async (job) => {
        calls.push(`${job.type}:${job.agentId ?? "new"}`);
        if (job.type === "create") {
          const agentId = calls.filter((c) => c.startsWith("create:")).length === 1
            ? "agent-old"
            : "agent-new";
          return {
            agentId,
            runId: `run-${agentId}`,
            done: Promise.resolve({
              requestId: "x",
              phase: "done",
              agentId,
              runId: `run-${agentId}`,
              status: "finished",
            }),
          };
        }
        const err = new Error("already has active run");
        (err as Error & { code?: string }).code = "active_run";
        throw err;
      },
      delete: async (agentId) => {
        deleted.push(agentId);
      },
    });

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(String(msg));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const backend = new SdkBackend(settings(), pool);
    const first = await backend.create("start", 99);
    expect(first.agentId).toBe("agent-old");
    await vi.waitFor(() => {
      expect(backend.spikeReport().sessions).toBe(1);
    });
    // clear busy from first create done
    await new Promise((r) => setTimeout(r, 20));

    const recovered = await backend.create("again", 99);
    expect(recovered.agentId).toBe("agent-new");
    expect(deleted).toContain("agent-old");
    expect(calls).toEqual([
      "create:new",
      "prompt:agent-old",
      "create:new",
    ]);
    expect(logs.some((l) => l.includes("session.recover"))).toBe(true);
    const recoverLine = logs.find(
      (l) => l.includes("session.recover") && l.includes("agent-new"),
    );
    expect(recoverLine).toBeTruthy();
    expect(recoverLine).toContain("agent-old");
    expect(recoverLine).toContain("agent-new");
  });

  it("R2: consecutive local busy skips recover after limit", async () => {
    const deleted: string[] = [];
    let createCount = 0;
    const pool = mockPool({
      submit: async (job) => {
        if (job.type === "create") {
          createCount += 1;
          const agentId = createCount === 1 ? "busy-agent" : "fresh-agent";
          return {
            agentId,
            runId: `run-${createCount}`,
            done: Promise.resolve({
              requestId: String(createCount),
              phase: "done",
              agentId,
              runId: `run-${createCount}`,
              status: "finished",
            }),
          };
        }
        throw new ActiveRunError(job.agentId!);
      },
      delete: async (id) => {
        deleted.push(id);
      },
    });

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const backend = new SdkBackend(settings(), pool);
    await backend.create("a", 5);
    await new Promise((r) => setTimeout(r, 20));

    // Force local busy so prompt throws before pool submit.
    (backend as unknown as { busyAgents: Set<string> }).busyAgents.add(
      "busy-agent",
    );

    const skip1 = await backend.create("b", 5);
    expect(skip1.runs[0]?.status).toBe("skipped_active_run");

    const afterLimit = await backend.create("c", 5);
    expect(afterLimit.agentId).toBe("fresh-agent");
    expect(deleted).toContain("busy-agent");
    expect(createCount).toBe(2);
  });
});
