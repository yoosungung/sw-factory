import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { loadSettings } from "../src/config.js";
import type { AgentBackend, AgentSession, RunResult } from "../src/session-manager.js";
import { MockBackend } from "../src/session-manager.js";

function mockSettings() {
  return loadSettings({
    ...process.env,
    AGENT_RUNNER_MOCK: "1",
    PORT: "8080",
  });
}

describe("agent-runner API", () => {
  const app = createApp(mockSettings());

  it("GET /healthz", async () => {
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("session lifecycle", async () => {
    const create = await app.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello", ticket_id: 1 }),
    });
    expect(create.status).toBe(201);
    const { agent_id: agentId } = (await create.json()) as { agent_id: string };
    expect(agentId.startsWith("mock-")).toBe(true);

    const prompt = await app.request(`/sessions/${agentId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "continue",
        event: "ticket_updated",
        ticket_id: 1,
      }),
    });
    expect(prompt.status).toBe(202);
    const body = (await prompt.json()) as { run_id: string; status: string };
    expect(body.status).toBe("accepted");
    expect(body.run_id).toBeTruthy();

    const del = await app.request(`/sessions/${agentId}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const missing = await app.request(`/sessions/${agentId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "nope" }),
    });
    expect(missing.status).toBe(404);
  });

  it("GET /spike/report", async () => {
    await app.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "spike", ticket_id: 99 }),
    });
    const report = await app.request("/spike/report");
    expect(report.status).toBe(200);
    const data = (await report.json()) as { sessions: number; total_runs: number };
    expect(data.sessions).toBeGreaterThanOrEqual(1);
    expect(data.total_runs).toBeGreaterThanOrEqual(1);
  });

  it("returns 409 when agent already has active run", async () => {
    const backend = new MockBackend();
    const busyApp = createApp(mockSettings(), backend);
    const create = await busyApp.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello", ticket_id: 42 }),
    });
    const { agent_id: agentId } = (await create.json()) as { agent_id: string };
    backend.markAgentBusy(agentId);

    const prompt = await busyApp.request(`/sessions/${agentId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "again", ticket_id: 42 }),
    });
    expect(prompt.status).toBe(409);
    expect(await prompt.json()).toEqual({
      run_id: "",
      status: "skipped_active_run",
    });
  });

  it("returns 202 before a slow background run would finish", async () => {
    class SlowFinishBackend implements AgentBackend {
      readonly sessions = new Map<string, AgentSession>();
      backgroundStarted = false;

      async create(prompt: string, ticketId?: number): Promise<AgentSession> {
        void prompt;
        const agentId = "slow-agent-1";
        this.sessions.set(agentId, { agentId, ticketId, runs: [] });
        return { agentId, ticketId, runs: [] };
      }

      async prompt(): Promise<RunResult> {
        this.backgroundStarted = true;
        void new Promise((resolve) => setTimeout(resolve, 500));
        return { runId: "bg-run", status: "accepted" };
      }

      async cancel(): Promise<void> {
        this.sessions.clear();
      }

      spikeReport(): { sessions: number; totalRuns: number } {
        return { sessions: this.sessions.size, totalRuns: 0 };
      }
    }

    const backend = new SlowFinishBackend();
    const slowApp = createApp(mockSettings(), backend);

    const create = await slowApp.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello", ticket_id: 5 }),
    });
    const { agent_id: agentId } = (await create.json()) as { agent_id: string };

    const started = Date.now();
    const prompt = await slowApp.request(`/sessions/${agentId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "go", ticket_id: 5 }),
    });
    const elapsed = Date.now() - started;

    expect(prompt.status).toBe(202);
    expect(await prompt.json()).toEqual({
      run_id: expect.any(String),
      status: "accepted",
    });
    expect(elapsed).toBeLessThan(200);
    expect(backend.backgroundStarted).toBe(true);
  });

  it("reuses agent for duplicate create on same ticket_id", async () => {
    const backend = new MockBackend();
    const reuseApp = createApp(mockSettings(), backend);
    const first = await reuseApp.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "first", ticket_id: 77 }),
    });
    const second = await reuseApp.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "second", ticket_id: 77 }),
    });
    const firstBody = (await first.json()) as { agent_id: string };
    const secondBody = (await second.json()) as { agent_id: string };
    expect(secondBody.agent_id).toBe(firstBody.agent_id);
  });

  it("accepts optional budget/policy on create and prompt", async () => {
    class CaptureBackend implements AgentBackend {
      lastCreateControl: unknown;
      lastPromptControl: unknown;
      async create(
        prompt: string,
        ticketId?: number,
        control?: unknown,
      ): Promise<AgentSession> {
        void prompt;
        this.lastCreateControl = control;
        return { agentId: "cap-1", ticketId, runs: [] };
      }
      async prompt(
        agentId: string,
        prompt: string,
        event?: string,
        ticketId?: number,
        control?: unknown,
      ): Promise<RunResult> {
        void agentId;
        void prompt;
        void event;
        void ticketId;
        this.lastPromptControl = control;
        return { runId: "r1", status: "accepted" };
      }
      async cancel(): Promise<void> {}
      spikeReport() {
        return { sessions: 1, totalRuns: 0 };
      }
    }

    const backend = new CaptureBackend();
    const appWithCapture = createApp(mockSettings(), backend);
    const create = await appWithCapture.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "hello",
        ticket_id: 1,
        budget: { max_turns: 15 },
        policy: { deny: ["force-push"] },
      }),
    });
    expect(create.status).toBe(201);
    expect(backend.lastCreateControl).toEqual({
      budget: { max_turns: 15 },
      policy: { deny: ["force-push"] },
    });

    const prompt = await appWithCapture.request("/sessions/cap-1/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "continue",
        ticket_id: 1,
        context_summary: "PR open",
      }),
    });
    expect(prompt.status).toBe(202);
    expect(backend.lastPromptControl).toEqual({
      context_summary: "PR open",
    });
  });
});
