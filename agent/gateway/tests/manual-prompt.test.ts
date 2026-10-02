import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tick } from "../src/loop";
import { composeManualPrompt, manualPromptFingerprint } from "../src/manual-prompt";
import { routeEvent } from "../src/router";
import type { AgentEvent, GatewayConfig, PromptTemplates } from "../src/types";

const prompts: PromptTemplates = {
  ticket_created: "Ticket {ticket_id} created. Active ticket_id={ticket_id}",
  ticket_updated: "Ticket {ticket_id} updated. Active ticket_id={ticket_id}",
  comment_added: "New comment on ticket {ticket_id}. Active ticket_id={ticket_id}",
  assignee_changed: "You are assignee of ticket {ticket_id}. Active ticket_id={ticket_id}",
  mention: "You were mentioned on ticket {ticket_id}. Active ticket_id={ticket_id}",
  handoff: "Handoff on ticket {ticket_id}. Active ticket_id={ticket_id}",
  catch_up: "Catch-up since {lookback_since}.",
};

const PM = {
  name: "pm",
  user_id: "user-pm",
  email: "pm@example.com",
  persona: "pm",
  type: "sessions" as const,
};
const TA = {
  name: "ta",
  user_id: "user-ta",
  email: "ta@example.com",
  persona: "ta",
  type: "sessions" as const,
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
      res.end(JSON.stringify({ agent_id: "agent-1" }));
      return;
    }
    if (req.method === "POST" && url.startsWith("/sessions/") && url.endsWith("/prompt")) {
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ run_id: "run-1", status: "accepted" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise<{ port: number; calls: CursorCall[]; close: () => Promise<void> }>((resolve) => {
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

function startMockFactory(events: AgentEvent[]) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/agent/events") {
      const after = url.searchParams.get("after_id");
      let slice = events;
      if (after) {
        const idx = events.findIndex((e) => e.id === after);
        slice = idx >= 0 ? events.slice(idx + 1) : events;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ events: slice }));
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

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("manual_prompt router", () => {
  it("routes only to payload target_user_id (not assignee/mention rules)", () => {
    const event: AgentEvent = {
      id: "mp-1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "manual_prompt",
      ticket_id: null,
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: PM.user_id,
      payload: { prompt: "hello", target_user_id: TA.user_id },
    };
    expect(routeEvent(event, [PM, TA]).map((a) => a.persona)).toEqual(["ta"]);
  });

  it("resolves target by name when target_user_id missing", () => {
    const event: AgentEvent = {
      id: "mp-2",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "manual_prompt",
      ticket_id: null,
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: null,
      payload: { prompt: "standup", target: "ta" },
    };
    expect(routeEvent(event, [PM, TA]).map((a) => a.persona)).toEqual(["ta"]);
  });

  it("returns empty when target unknown", () => {
    const event: AgentEvent = {
      id: "mp-3",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "manual_prompt",
      ticket_id: null,
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: null,
      payload: { prompt: "x", target_user_id: "missing" },
    };
    expect(routeEvent(event, [PM, TA])).toEqual([]);
  });
});

describe("composeManualPrompt", () => {
  it("appends Active ticket scope when ticket_id set", () => {
    const event: AgentEvent = {
      id: "mp",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "manual_prompt",
      ticket_id: "t-active",
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: TA.user_id,
      payload: { prompt: "Do the thing" },
    };
    const text = composeManualPrompt(event);
    expect(text).toContain("Do the thing");
    expect(text).toContain("Active ticket_id=t-active");
  });

  it("does not append Active scope when ticketless", () => {
    const event: AgentEvent = {
      id: "mp",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "manual_prompt",
      ticket_id: null,
      project_id: null,
      actor_user_id: "human-1",
      assignee_user_id: TA.user_id,
      payload: { prompt: "Freeform" },
    };
    expect(composeManualPrompt(event)).toBe("Freeform");
  });
});

describe("manual_prompt delivery", () => {
  it("delivers ticketless prompt via POST /sessions", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-mp-"));
    tempDirs.push(dataDir);
    const events: AgentEvent[] = [
      {
        id: "evt-mp-1",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "manual_prompt",
        ticket_id: null,
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: TA.user_id,
        payload: { prompt: "On-demand hello", target_user_id: TA.user_id },
      },
    ];
    const factory = await startMockFactory(events);
    const cursor = await startMockCursor();
    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, TA],
      prompts,
      debounceMs: 0,
      pollLimit: 50,
      retryMaxAttempts: 5,
    };
    const result = await tick({ config });
    expect(result.acked_id).toBe("evt-mp-1");
    expect(result.dispatched).toEqual([
      expect.objectContaining({
        event_id: "evt-mp-1",
        persona: "ta",
        ticket_id: null,
        agent_id: "agent-1",
      }),
    ]);
    expect(cursor.calls[0].url).toBe("/sessions");
    expect(cursor.calls[0].body).toMatchObject({
      persona: "ta",
      ticket_id: null,
    });
    expect(String(cursor.calls[0].body.prompt)).toBe("On-demand hello");
    expect(String(cursor.calls[0].body.prompt)).not.toContain("Active ticket_id=");
    await factory.close();
    await cursor.close();
  });

  it("delivers with Active ticket_id when ticket_id present", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-mp-t-"));
    tempDirs.push(dataDir);
    const events: AgentEvent[] = [
      {
        id: "evt-mp-t",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "manual_prompt",
        ticket_id: "ticket-99",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: PM.user_id,
        payload: { prompt: "Work this ticket", target_user_id: PM.user_id },
      },
    ];
    const factory = await startMockFactory(events);
    const cursor = await startMockCursor();
    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, TA],
      prompts,
      debounceMs: 0,
      pollLimit: 50,
      retryMaxAttempts: 5,
    };
    const result = await tick({ config });
    expect(result.acked_id).toBe("evt-mp-t");
    expect(result.dispatched[0]).toMatchObject({
      event_id: "evt-mp-t",
      persona: "pm",
      ticket_id: "ticket-99",
    });
    expect(cursor.calls[0].body).toMatchObject({ ticket_id: "ticket-99", persona: "pm" });
    expect(String(cursor.calls[0].body.prompt)).toContain("Work this ticket");
    expect(String(cursor.calls[0].body.prompt)).toContain("Active ticket_id=ticket-99");
    await factory.close();
    await cursor.close();
  });

  it("releases claim after deliver failure so the same event can retry", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-mp-retry-"));
    tempDirs.push(dataDir);
    const events: AgentEvent[] = [
      {
        id: "evt-mp-fail",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "manual_prompt",
        ticket_id: null,
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: TA.user_id,
        payload: { prompt: "retry me", target_user_id: TA.user_id },
      },
    ];
    let sessionHits = 0;
    // First tick: processEvent + flushRetries both hit /sessions → fail both.
    // Second tick: succeed once claim was released.
    const failUntil = 2;
    const factory = await startMockFactory(events);
    const cursorServer = createServer(async (req, res) => {
      const url = req.url ?? "";
      if (req.method === "POST" && url === "/sessions") {
        sessionHits += 1;
        if (sessionHits <= failUntil) {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ reason: "unavailable" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ agent_id: "agent-retry" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const cursorPort = await new Promise<number>((resolve) => {
      cursorServer.listen(0, "127.0.0.1", () => {
        const addr = cursorServer.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursorPort}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, TA],
      prompts,
      debounceMs: 0,
      pollLimit: 50,
      retryMaxAttempts: 5,
    };
    const first = await tick({ config });
    expect(first.acked_id).toBeNull();
    expect(first.dispatched).toHaveLength(0);
    expect(sessionHits).toBe(failUntil);

    const second = await tick({ config });
    expect(second.acked_id).toBe("evt-mp-fail");
    expect(second.dispatched).toEqual([
      expect.objectContaining({
        event_id: "evt-mp-fail",
        persona: "ta",
        agent_id: "agent-retry",
      }),
    ]);
    expect(sessionHits).toBe(failUntil + 1);
    await factory.close();
    await new Promise<void>((r) => cursorServer.close(() => r()));
  });

  it("dedupes identical payload within the same UTC minute but still acks", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-mp-d-"));
    tempDirs.push(dataDir);
    const payload = { prompt: "same", target_user_id: TA.user_id };
    const events: AgentEvent[] = [
      {
        id: "evt-mp-a",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "manual_prompt",
        ticket_id: null,
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: TA.user_id,
        payload,
      },
      {
        id: "evt-mp-b",
        at: "2026-01-01T00:00:02.000Z",
        event_type: "manual_prompt",
        ticket_id: null,
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: TA.user_id,
        payload: { ...payload },
      },
    ];
    expect(manualPromptFingerprint(events[0]!)).toBe(manualPromptFingerprint(events[1]!));
    const factory = await startMockFactory(events);
    const cursor = await startMockCursor();
    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, TA],
      prompts,
      debounceMs: 0,
      pollLimit: 50,
      retryMaxAttempts: 5,
    };
    const result = await tick({ config });
    expect(result.acked_id).toBe("evt-mp-b");
    expect(result.dispatched).toHaveLength(1);
    expect(cursor.calls.filter((c) => c.url === "/sessions")).toHaveLength(1);
    await factory.close();
    await cursor.close();
  });
});
