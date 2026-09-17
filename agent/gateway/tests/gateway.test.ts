import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tick } from "../src/loop";
import { loadCheckpoint } from "../src/checkpoint";
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

function startMockCursor(opts?: {
  promptStatus?: number;
  promptBody?: Record<string, unknown>;
}) {
  const calls: CursorCall[] = [];
  const promptStatus = opts?.promptStatus ?? 202;
  const promptBody = opts?.promptBody ?? { run_id: "run-1", status: "accepted" };

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
      res.writeHead(promptStatus, { "content-type": "application/json" });
      res.end(JSON.stringify(promptBody));
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
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
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
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
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

describe("router", () => {
  it("routes to assignee and skips self-echo", () => {
    const event: AgentEvent = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: PM.user_id,
      payload: {},
    };
    expect(routeEvent(event, [PM, TA])).toEqual([]);

    const humanActor = { ...event, actor_user_id: "human-1" };
    expect(routeEvent(humanActor, [PM, TA]).map((a) => a.persona)).toEqual(["pm"]);
  });

  it("routes unassigned (null assignee) to pm", () => {
    const event: AgentEvent = {
      id: "e-unassigned",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_created",
      ticket_id: "t-u",
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: null,
      payload: {},
    };
    expect(routeEvent(event, [PM, TA]).map((a) => a.persona)).toEqual(["pm"]);
    expect(routeEvent(event, [TA]).map((a) => a.persona)).toEqual([]);
  });
  it("routes mention_user_ids to sessions personas", () => {
    const event: AgentEvent = {
      id: "e-mention",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "comment_added",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: TA.user_id,
      payload: { mention_user_ids: [PM.user_id] },
    };
    expect(routeEvent(event, [PM, TA]).map((a) => a.persona).sort()).toEqual(["pm", "ta"]);
  });
});

describe("A2 gateway e2e", () => {
  it("tails events and delivers 202 to mock cursor then advances acked_id", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-"));
    tempDirs.push(dataDir);

    const events: AgentEvent[] = [
      {
        id: "evt-1",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "ticket_created",
        ticket_id: "ticket-1",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: PM.user_id,
        payload: {},
      },
      {
        id: "evt-2",
        at: "2026-01-01T00:00:02.000Z",
        event_type: "comment_added",
        ticket_id: "ticket-1",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: PM.user_id,
        payload: { comment_id: "c1" },
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
    expect(result.processed).toBe(2);
    expect(result.acked_id).toBe("evt-2");
    expect(result.dispatched).toHaveLength(2);

    expect(cursor.calls[0].url).toBe("/sessions");
    expect(cursor.calls[0].body.persona).toBe("pm");
    expect(String(cursor.calls[0].body.prompt)).toContain("ticket-1");
    expect(cursor.calls[1].url).toBe("/sessions/agent-1/prompt");
    expect(cursor.calls[1].body).toMatchObject({ ticket_id: "ticket-1" });

    const checkpoint = await loadCheckpoint(dataDir);
    expect(checkpoint.acked_id).toBe("evt-2");

    // second tick: no new events, no duplicate dispatch
    const before = cursor.calls.length;
    const again = await tick({ config });
    expect(again.processed).toBe(0);
    expect(cursor.calls.length).toBe(before);

    await factory.close();
    await cursor.close();
  });

  it("does not advance acked_id on busy and retries later", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-busy-"));
    tempDirs.push(dataDir);

    const events: AgentEvent[] = [
      {
        id: "evt-busy",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "ticket_created",
        ticket_id: "ticket-busy",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: TA.user_id,
        payload: {},
      },
    ];

    const factory = await startMockFactory(events);
    let promptHits = 0;
    const cursorServer = createServer(async (req, res) => {
      const url = req.url ?? "";
      const body = req.method === "POST" ? await readJson(req) : {};
      void body;
      if (url === "/sessions") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ agent_id: "agent-ta" }));
        return;
      }
      if (url.endsWith("/prompt")) {
        promptHits += 1;
        if (promptHits === 1) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "skipped_active_run", reason: "busy" }));
          return;
        }
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ run_id: "r2", status: "accepted" }));
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

    // First delivery creates session (200) — that succeeds; only sticky prompt would busy.
    // Force sticky path: seed sticky after first successful create by running tick once
    // with create-only then busy on second event. Simpler: first tick create succeeds → ack.
    // For busy test, start with sticky already set via two-step:
    const first = await tick({ config });
    expect(first.acked_id).toBe("evt-busy");

    // Add second event and make prompt busy then ok via flush on next tick
    events.push({
      id: "evt-busy-2",
      at: "2026-01-01T00:00:02.000Z",
      event_type: "ticket_updated",
      ticket_id: "ticket-busy",
      project_id: "proj-1",
      actor_user_id: "human-1",
      assignee_user_id: TA.user_id,
      payload: { changed_fields: ["status"] },
    });

    const second = await tick({ config });
    // first prompt hit is busy → should not ack evt-busy-2
    expect(second.acked_id).toBe("evt-busy");

    const third = await tick({ config });
    expect(third.acked_id).toBe("evt-busy-2");
    expect(promptHits).toBeGreaterThanOrEqual(2);

    await factory.close();
    await new Promise<void>((r) => cursorServer.close(() => r()));
  });

  it("rebinds sticky session on 404 not_found then accepts", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-404-rebind-"));
    tempDirs.push(dataDir);

    const events: AgentEvent[] = [
      {
        id: "evt-rebind",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "comment_added",
        ticket_id: "ticket-rebind",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: PM.user_id,
        payload: { mention_user_ids: [PM.user_id] },
      },
    ];

    const factory = await startMockFactory(events);
    const hits: string[] = [];
    const cursorServer = createServer(async (req, res) => {
      const url = req.url ?? "";
      hits.push(`${req.method} ${url}`);
      if (url === "/sessions/agent-dead/prompt") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      if (url === "/sessions") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ agent_id: "agent-fresh" }));
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

    const { saveSticky } = await import("../src/checkpoint");
    await saveSticky(dataDir, { "ticket-rebind:pm": "agent-dead" });

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

    const result = await tick({ config });
    expect(result.acked_id).toBe("evt-rebind");
    expect(result.dispatched).toEqual([
      { event_id: "evt-rebind", persona: "pm", agent_id: "agent-fresh" },
    ]);
    expect(hits.some((h) => h.includes("/sessions/agent-dead/prompt"))).toBe(true);
    expect(hits.some((h) => h === "POST /sessions")).toBe(true);

    await factory.close();
    await new Promise<void>((r) => cursorServer.close(() => r()));
  });

  it("acks multi-target event when one persona accepts and sibling hits mutex", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "gw-mention-mutex-"));
    tempDirs.push(dataDir);

    const events: AgentEvent[] = [
      {
        id: "evt-mention",
        at: "2026-01-01T00:00:01.000Z",
        event_type: "comment_added",
        ticket_id: "ticket-shared",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: TA.user_id,
        payload: { mention_user_ids: [PM.user_id] },
      },
      {
        id: "evt-later",
        at: "2026-01-01T00:00:02.000Z",
        event_type: "comment_added",
        ticket_id: "ticket-other",
        project_id: "proj-1",
        actor_user_id: "human-1",
        assignee_user_id: PM.user_id,
        payload: { mention_user_ids: [PM.user_id] },
      },
    ];

    const factory = await startMockFactory(events);
    const seen: string[] = [];
    const cursorServer = createServer(async (req, res) => {
      const url = req.url ?? "";
      const body = req.method === "POST" ? await readJson(req) : {};
      const persona = typeof body.persona === "string" ? body.persona : "";
      if (url === "/sessions" || url.endsWith("/prompt")) {
        seen.push(persona);
        // First target (ta assignee) accepts; second (pm mention) mutex — then later pm ok.
        if (persona === "pm" && seen.filter((p) => p === "pm").length === 1) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "skipped_mutex" }));
          return;
        }
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ agent_id: `agent-${persona}`, run_id: "r1", status: "accepted" }));
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

    const result = await tick({ config });
    expect(result.dispatched.map((d) => d.persona).sort()).toEqual(["pm", "ta"]);
    expect(result.acked_id).toBe("evt-later");
    expect(seen.includes("pm")).toBe(true);
    expect(seen.includes("ta")).toBe(true);

    await factory.close();
    await new Promise<void>((r) => cursorServer.close(() => r()));
  });
});
