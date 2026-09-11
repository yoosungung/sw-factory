import { mkdtemp, rm, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../src/mock-backend";
import { personaCwd } from "../src/pvc";
import { Recover } from "../src/recover";
import { createRunner } from "../src/server";
import { SessionMap } from "../src/session-map";
import type { RunnerSettings } from "../src/types";

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function tmpData(): Promise<string> {
  const root = path.join(process.cwd(), ".tmp-test");
  await mkdir(root, { recursive: true });
  const d = await mkdtemp(path.join(root, "cursor-"));
  tempDirs.push(d);
  return d;
}

function settings(dataDir: string, overrides?: Partial<RunnerSettings>): RunnerSettings {
  return {
    dataDir,
    poolSize: 2,
    maxActivePerPersona: 1,
    maxQueuePerPersona: 32,
    activeRunSkipLimit: 2,
    createThrottleMs: 50,
    ...overrides,
  };
}

describe("A3 cursor runner", () => {
  it("creates session under persona cwd and accepts parallel prompts across personas", async () => {
    const dataDir = await tmpData();
    const backend = createMockBackend({ sendDelayMs: 40 });
    const { app } = createRunner({ settings: settings(dataDir), backend });

    const mk = (persona: string, ticket: string) =>
      app.request("http://local/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: `work ${ticket}`,
          ticket_id: ticket,
          persona,
        }),
      });

    const [r1, r2] = await Promise.all([mk("pm", "t-pm"), mk("ta", "t-ta")]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const a1 = ((await r1.json()) as { agent_id: string }).agent_id;
    const a2 = ((await r2.json()) as { agent_id: string }).agent_id;

    await access(personaCwd(dataDir, "pm"));
    await access(personaCwd(dataDir, "ta"));

    // wait for first prompts to finish
    await new Promise((r) => setTimeout(r, 80));

    const [p1, p2] = await Promise.all([
      app.request(`http://local/sessions/${a1}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "follow-up pm", ticket_id: "t-pm" }),
      }),
      app.request(`http://local/sessions/${a2}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "follow-up ta", ticket_id: "t-ta" }),
      }),
    ]);
    expect(p1.status).toBe(202);
    expect(p2.status).toBe(202);

    await new Promise((r) => setTimeout(r, 100));
    expect(backend.prompts.some((p) => p.prompt.includes("follow-up pm"))).toBe(true);
    expect(backend.prompts.some((p) => p.prompt.includes("follow-up ta"))).toBe(true);
    expect(backend.prompts.every((p) => p.cwd.includes("/workspaces/"))).toBe(true);
  });

  it("returns 409 mutex when same ticket is in-flight", async () => {
    const dataDir = await tmpData();
    const backend = createMockBackend({ sendDelayMs: 80 });
    const { app } = createRunner({ settings: settings(dataDir), backend });

    const first = await app.request("http://local/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "one", ticket_id: "same", persona: "pm" }),
    });
    expect(first.status).toBe(200);

    const second = await app.request("http://local/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "two", ticket_id: "same", persona: "ta" }),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { status: string }).status).toBe("skipped_mutex");
  });

  it("R1–R5 recovery behaviors", async () => {
    const dataDir = await tmpData();
    const backend = createMockBackend({ sendDelayMs: 5 });
    const sessions = new SessionMap();
    const recover = new Recover(sessions, backend, 2);

    sessions.set({
      agentId: "a1",
      persona: "pm",
      ticketId: "t1",
      cwd: personaCwd(dataDir, "pm"),
      activeRun: true,
      skipCount: 0,
      createdAt: new Date().toISOString(),
    });

    await recover.onWorkerCrash("a1");
    expect(sessions.get("a1")?.activeRun).toBe(false);
    expect(recover.logs.some((l) => l.reason === "R1_worker_crash")).toBe(true);

    sessions.get("a1")!.activeRun = true;
    await recover.onActiveRunFail("a1", "boom");
    expect(sessions.get("a1")?.activeRun).toBe(false);
    expect(recover.logs.some((l) => l.reason === "R2_active_run_fail")).toBe(true);

    expect(recover.onSkippedBusy("a1")).toBe("busy");
    expect(recover.onSkippedBusy("a1")).toBe("sdk_zombie");
    expect(recover.logs.some((l) => l.reason === "R3_skip_threshold")).toBe(true);

    const recreated = await recover.recreateSession("a1", {
      persona: "pm",
      cwd: personaCwd(dataDir, "pm"),
      prompt: "rebind",
      ticketId: "t1",
    });
    expect(sessions.get("a1")).toBeUndefined();
    expect(sessions.get(recreated.agentId)?.ticketId).toBe("t1");
    expect(recover.logs.some((l) => l.reason === "R4_session_recreate")).toBe(true);

    const snap = recover.snapshot();
    expect(snap.some((l) => l.reason === "R5_recover_log")).toBe(true);
  });

  it("returns sdk_zombie after skip threshold on prompt", async () => {
    const dataDir = await tmpData();
    let gate!: { resolve: () => void };
    const hold = new Promise<void>((resolve) => {
      gate = { resolve };
    });
    const backend = createMockBackend({
      sendDelayMs: 0,
      onSend: async () => {
        await hold;
      },
    });
    const { app } = createRunner({
      settings: settings(dataDir, { activeRunSkipLimit: 2 }),
      backend,
    });

    const created = await app.request("http://local/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "start", ticket_id: "tz", persona: "qa" }),
    });
    const agentId = ((await created.json()) as { agent_id: string }).agent_id;

    // still active
    const b1 = await app.request(`http://local/sessions/${agentId}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    });
    expect(b1.status).toBe(409);
    expect(((await b1.json()) as { reason: string }).reason).toBe("busy");

    const b2 = await app.request(`http://local/sessions/${agentId}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "y" }),
    });
    expect(b2.status).toBe(409);
    expect(((await b2.json()) as { reason: string }).reason).toBe("sdk_zombie");

    gate.resolve();
  });
});
