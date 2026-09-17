import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAgentsYaml } from "../../shared/load-config";
import { runCatchUp } from "../src/catch-up";
import { cronMatches, fireKey } from "../src/cron";
import {
  composeSchedulePrompt,
  evaluateGates,
  resolveScheduleAgents,
} from "../src/schedule";
import { claimScheduleFire } from "../src/schedule-fires";
import { tickSchedules } from "../src/schedule-tick";
import type { GatewayConfig, PersonaConfig, PromptTemplates } from "../src/types";

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

const prompts: PromptTemplates = {
  ticket_created: "Ticket {ticket_id} created. Active ticket_id={ticket_id}",
  ticket_updated: "Ticket {ticket_id} updated. Active ticket_id={ticket_id}",
  comment_added: "New comment on ticket {ticket_id}. Active ticket_id={ticket_id}",
  assignee_changed: "You are assignee of ticket {ticket_id}. Active ticket_id={ticket_id}",
  mention: "You were mentioned on ticket {ticket_id}. Active ticket_id={ticket_id}",
  handoff: "Handoff on ticket {ticket_id}. Active ticket_id={ticket_id}",
  catch_up: "Catch-up since {lookback_since}. Pick at most one actionable item.",
};

const PM: PersonaConfig = {
  name: "pm",
  user_id: "user-pm",
  email: "pm@example.com",
  persona: "pm",
  type: "sessions",
};
const TA: PersonaConfig = {
  name: "ta",
  user_id: "user-ta",
  email: "ta@example.com",
  persona: "ta",
  type: "sessions",
};
const ADMIN: PersonaConfig = {
  name: "admin",
  user_id: "user-admin",
  email: "admin@example.com",
  persona: "admin",
  type: "human",
};

type CursorCall = { method: string; url: string; body: Record<string, unknown> };

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function startMockCursor() {
  const calls: CursorCall[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "";
    const body = req.method === "POST" ? await readJson(req) : {};
    calls.push({ method: req.method ?? "GET", url, body });
    if (req.method === "POST" && url === "/sessions") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ agent_id: `agent-${calls.length}` }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise<{
    port: number;
    calls: CursorCall[];
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        calls,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function startMockFactory(gates: { in_progress: boolean; flow_active: boolean }) {
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/agent/flow-gates")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(gates));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe("cron", () => {
  it("matches 5-field UTC expressions", () => {
    const d = new Date("2026-09-21T02:00:00.000Z"); // Monday 02:00
    expect(cronMatches("* * * * *", d)).toBe(true);
    expect(cronMatches("0 2 * * 1", d)).toBe(true);
    expect(cronMatches("5,20,35,50 * * * *", d)).toBe(false);
    expect(cronMatches("5,20,35,50 * * * *", new Date("2026-09-21T02:20:00.000Z"))).toBe(
      true,
    );
    expect(parseInt(fireKey(d).slice(11, 13), 10)).toBe(2);
    expect(cronMatches("* * * * * extra", d)).toBe(false);
  });
});

describe("schedule helpers", () => {
  it("resolves named sessions agents and skips human", () => {
    const named = resolveScheduleAgents(
      { id: "x", cron: "* * * * *", prompt: "p", agents: ["pm", "admin"] },
      [PM, TA, ADMIN],
    );
    expect(named.map((a) => a.name)).toEqual(["pm"]);
    const all = resolveScheduleAgents(
      { id: "y", cron: "* * * * *", prompt: "p" },
      [PM, TA, ADMIN],
    );
    expect(all.map((a) => a.name)).toEqual(["pm", "ta"]);
  });

  it("fail-closes unknown gates and missing snapshot", () => {
    expect(evaluateGates([], { in_progress: false, flow_active: false })).toBe(true);
    expect(evaluateGates(["nope"], { in_progress: true, flow_active: true })).toBe(
      false,
    );
    expect(evaluateGates(["flow_active"], null)).toBe(false);
    expect(
      evaluateGates(["flow_active"], { in_progress: false, flow_active: true }),
    ).toBe(true);
    expect(
      evaluateGates(["in_progress"], { in_progress: false, flow_active: true }),
    ).toBe(false);
  });

  it("appends success checks", () => {
    const text = composeSchedulePrompt(
      { id: "x", cron: "* * * * *", prompt: "Do work", success_checks: ["local"] },
      ["global"],
    );
    expect(text).toContain("Do work");
    expect(text).toContain("- local");
    expect(text).toContain("- global");
  });
});

describe("schedule tick + catch-up", () => {
  it("fires ticketless sessions once per minute and respects gates/dedupe", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-sched-"));
    tempDirs.push(dataDir);
    const factory = await startMockFactory({
      in_progress: true,
      flow_active: true,
    });
    const cursor = await startMockCursor();
    const now = new Date("2026-09-21T08:05:10.000Z");
    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, TA, ADMIN],
      prompts,
      debounceMs: 0,
      pollLimit: 10,
      retryMaxAttempts: 3,
      successChecks: ["wiki-first"],
      schedules: [
        {
          id: "pm-checkpoint",
          cron: "5,20,35,50 * * * *",
          prompt: "Use factory-pm. Dual-loop checkpoint.",
          agents: ["pm"],
          gates: ["flow_active"],
        },
        {
          id: "blocked-gate",
          cron: "5,20,35,50 * * * *",
          prompt: "should not fire",
          agents: ["pm"],
          gates: ["unknown_gate"],
        },
      ],
    };

    const first = await tickSchedules({ config, now });
    expect(first.fired).toEqual([{ schedule_id: "pm-checkpoint", persona: "pm" }]);
    expect(first.skipped.some((s) => s.schedule_id === "blocked-gate")).toBe(true);
    expect(cursor.calls).toHaveLength(1);
    expect(cursor.calls[0].url).toBe("/sessions");
    expect(cursor.calls[0].body.ticket_id).toBeNull();
    expect(cursor.calls[0].body.persona).toBe("pm");
    expect(String(cursor.calls[0].body.prompt)).toContain("wiki-first");

    const again = await tickSchedules({ config, now });
    expect(again.fired).toEqual([]);
    expect(again.skipped.some((s) => s.reason === "dedupe")).toBe(true);
    expect(cursor.calls).toHaveLength(1);

    await cursor.close();
    await factory.close();
  });

  it("claimScheduleFire is exclusive", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-claim-"));
    tempDirs.push(dataDir);
    const a = await claimScheduleFire(dataDir, "pm-checkpoint", "2026-09-21T08:05");
    const b = await claimScheduleFire(dataDir, "pm-checkpoint", "2026-09-21T08:05");
    expect(a).toBe(true);
    expect(b).toBe(false);
  });

  it("dispatches catch_up once per sessions persona and records lookback", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-cu-"));
    tempDirs.push(dataDir);
    const cursor = await startMockCursor();
    const now = new Date("2026-09-21T12:00:00.000Z");
    const config: GatewayConfig = {
      factoryBaseUrl: "http://127.0.0.1:9",
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, TA, ADMIN],
      prompts,
      debounceMs: 0,
      pollLimit: 10,
      retryMaxAttempts: 3,
    };
    const first = await runCatchUp({ config, now });
    expect(first.dispatched).toEqual(["pm", "ta"]);
    expect(first.lookback_since).toBe(
      new Date(now.getTime() - 48 * 3600 * 1000).toISOString(),
    );
    expect(cursor.calls).toHaveLength(2);
    expect(String(cursor.calls[0].body.prompt)).toContain("Catch-up since");
    expect(cursor.calls[0].body.ticket_id).toBeNull();

    const second = await runCatchUp({
      config,
      now: new Date("2026-09-21T13:00:00.000Z"),
    });
    expect(second.lookback_since).toBe(now.toISOString());

    await cursor.close();
  });

  it("loads schedules from yaml", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gw-yaml-"));
    tempDirs.push(dir);
    const p = path.join(dir, "agents.yaml");
    await writeFile(
      p,
      `
factory_base_url: https://factory.example.com
settings:
  schedules:
    - id: pm-checkpoint
      cron: "5,20,35,50 * * * *"
      agents: [pm]
      gates: [flow_active]
      prompt: checkpoint
prompts:
  ticket_created: t
  ticket_updated: u
  comment_added: c
  assignee_changed: a
  mention: m
  handoff: h
  catch_up: catch
agents:
  - name: pm
    user_id: "00000000-0000-0000-0000-000000000002"
    email: pm@example.com
    persona: pm
    type: sessions
`,
      "utf8",
    );
    const file = await loadAgentsYaml(p);
    expect(file.settings.schedules?.[0]?.id).toBe("pm-checkpoint");
  });
});
