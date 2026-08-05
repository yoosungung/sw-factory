import { describe, expect, it, vi } from "vitest";

import { loadSettings } from "../src/config.js";
import type { WorkerDone } from "../src/job-types.js";
import {
  ActiveRunError,
  SdkBackend,
  SKIPPED_ACTIVE_RUN_THRESHOLD,
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

function recoverLogs(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map((c) => {
      try {
        return JSON.parse(String(c[0])) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((o): o is Record<string, unknown> => o?.event === "session.recover");
}

const finished = (agentId: string, runId: string): WorkerDone => ({
  requestId: runId,
  phase: "done",
  agentId,
  runId,
  status: "finished",
});

describe("SdkBackend Recovery R1–R5", () => {
  it("R1: worker crash on done reject → forget mapping + session.recover worker_crash", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let doneReject!: (reason: unknown) => void;
    const crashDone = new Promise<WorkerDone>((_res, rej) => {
      doneReject = rej;
    });
    let creates = 0;
    const pool = mockPool({
      submit: async (job) => {
        if (job.type === "create") {
          creates += 1;
          if (creates === 1) {
            return { agentId: "agent-crash", runId: "run-1", done: crashDone };
          }
          return {
            agentId: "agent-fresh",
            runId: "run-new",
            done: Promise.resolve(finished("agent-fresh", "run-new")),
          };
        }
        return {
          agentId: job.agentId!,
          runId: "run-p",
          done: Promise.resolve(finished(job.agentId!, "run-p")),
        };
      },
    });

    const backend = new SdkBackend(settings(), pool);
    expect((await backend.create("hello", 100)).agentId).toBe("agent-crash");

    doneReject(new Error("worker w1 exited during job"));
    await vi.waitFor(() => {
      expect(recoverLogs(logSpy).some((e) => e.reason === "worker_crash")).toBe(
        true,
      );
    });

    expect((await backend.create("again", 100)).agentId).toBe("agent-fresh");
    expect(creates).toBe(2);
    logSpy.mockRestore();
  });

  it("R2: submit active_run fail → forget + cancel best-effort", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const deletes: string[] = [];
    let creates = 0;
    let zombiePrompt = false;
    const pool = mockPool({
      submit: async (job) => {
        if (job.type === "create") {
          creates += 1;
          const agentId = creates === 1 ? "agent-z" : "agent-z2";
          return {
            agentId,
            runId: `run-c${creates}`,
            done: Promise.resolve(finished(agentId, `run-c${creates}`)),
          };
        }
        if (zombiePrompt) {
          const err = new Error("Agent agent-z already has active run");
          (err as Error & { code?: string }).code = "active_run";
          throw err;
        }
        return {
          agentId: job.agentId!,
          runId: "run-p",
          done: Promise.resolve(finished(job.agentId!, "run-p")),
        };
      },
      delete: async (agentId) => {
        deletes.push(agentId);
      },
    });

    const backend = new SdkBackend(settings(), pool);
    await backend.create("one", 200);
    await new Promise((r) => setTimeout(r, 20));

    zombiePrompt = true;
    await expect(
      backend.prompt("agent-z", "two", undefined, 200),
    ).rejects.toBeInstanceOf(ActiveRunError);
    await vi.waitFor(() => {
      expect(
        recoverLogs(logSpy).some((e) => e.reason === "active_run_fail"),
      ).toBe(true);
    });
    expect(deletes).toContain("agent-z");

    zombiePrompt = false;
    expect((await backend.create("three", 200)).agentId).toBe("agent-z2");
    logSpy.mockRestore();
  });

  it("R3+R4: consecutive skipped_active_run >= threshold → cancel + new session", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(SKIPPED_ACTIVE_RUN_THRESHOLD).toBe(2);
    const deletes: string[] = [];
    let creates = 0;
    let holdResolve!: (v: WorkerDone) => void;
    const holdDone = new Promise<WorkerDone>((r) => {
      holdResolve = r;
    });
    let holding = false;

    const pool = mockPool({
      submit: async (job) => {
        if (job.type === "create") {
          creates += 1;
          const agentId = creates === 1 ? "agent-busy" : "agent-new";
          return {
            agentId,
            runId: `run-c${creates}`,
            done: Promise.resolve(finished(agentId, `run-c${creates}`)),
          };
        }
        if (holding && job.agentId === "agent-busy") {
          return { agentId: "agent-busy", runId: "hold", done: holdDone };
        }
        return {
          agentId: job.agentId!,
          runId: "run-p",
          done: Promise.resolve(finished(job.agentId!, "run-p")),
        };
      },
      delete: async (agentId) => {
        deletes.push(agentId);
      },
    });

    const backend = new SdkBackend(settings(), pool);
    await backend.create("seed", 300);
    await new Promise((r) => setTimeout(r, 20));

    holding = true;
    await backend.prompt("agent-busy", "hold", undefined, 300);

    const skip1 = await backend.create("skip1", 300);
    expect(skip1.runs[0]?.status).toBe("skipped_active_run");
    expect(skip1.agentId).toBe("agent-busy");

    const recovered = await backend.create("skip2", 300);
    expect(recovered.agentId).toBe("agent-new");
    expect(deletes).toContain("agent-busy");
    expect(
      recoverLogs(logSpy).some(
        (e) => e.reason === "skipped_active_run" && e.action === "cancel",
      ),
    ).toBe(true);

    holdResolve(finished("agent-busy", "hold"));
    logSpy.mockRestore();
  });
});
