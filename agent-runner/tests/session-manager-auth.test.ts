import { describe, expect, it, vi } from "vitest";

import { loadSettings } from "../src/config.js";
import type { WorkerDone } from "../src/job-types.js";
import {
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

describe("SdkBackend via RunPool", () => {
  it("create returns accepted and tracks ticket agent", async () => {
    let doneResolve!: (value: WorkerDone) => void;
    const done = new Promise<WorkerDone>((r) => {
      doneResolve = r;
    });
    const pool = mockPool({
      submit: async (job) => {
        expect(job.type).toBe("create");
        return {
          agentId: "agent-pool-1",
          runId: "run-1",
          done,
        };
      },
    });

    const backend = new SdkBackend(settings(), pool);
    const session = await backend.create("hello", 42);
    expect(session.agentId).toBe("agent-pool-1");
    expect(session.runs[0]?.status).toBe("accepted");

    doneResolve({
      requestId: "x",
      phase: "done",
      agentId: "agent-pool-1",
      runId: "run-1",
      status: "finished",
    });
    await done;
    await vi.waitFor(() => {
      expect(backend.spikeReport().sessions).toBe(1);
    });
  });

  it("reuses ticket agent on second create", async () => {
    const calls: string[] = [];
    const pool = mockPool({
      submit: async (job) => {
        calls.push(job.type);
        if (job.type === "create") {
          return {
            agentId: "agent-reuse",
            runId: "run-a",
            done: Promise.resolve({
              requestId: "1",
              phase: "done",
              agentId: "agent-reuse",
              runId: "run-a",
              status: "finished",
            }),
          };
        }
        return {
          agentId: job.agentId!,
          runId: "run-b",
          done: Promise.resolve({
            requestId: "2",
            phase: "done",
            agentId: job.agentId!,
            runId: "run-b",
            status: "finished",
          }),
        };
      },
    });

    const backend = new SdkBackend(settings(), pool);
    const first = await backend.create("one", 7);
    await first; // allow busy clear
    await new Promise((r) => setTimeout(r, 10));
    const second = await backend.create("two", 7);
    expect(second.agentId).toBe("agent-reuse");
    expect(calls).toEqual(["create", "prompt"]);
  });
});
