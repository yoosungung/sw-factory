import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeMessage,
  detectHitlMail,
  maybeSendHitlMail,
  type HitlMailConfig,
  type HitlSendMail,
} from "../src/hitl-mail";
import { clearProjectNameCache } from "../src/ticket-no";
import { tick } from "../src/loop";
import { loadCheckpoint } from "../src/checkpoint";
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

const ADMIN = {
  name: "eric",
  user_id: "user-eric",
  email: "eric@example.com",
  persona: "admin",
  type: "human" as const,
};

const tempDirs: string[] = [];
afterEach(async () => {
  clearProjectNameCache();
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "swf-hitl-"));
  tempDirs.push(d);
  return d;
}

describe("detectHitlMail", () => {
  it("detects waiting_for_approval when assignee is human", () => {
    const event: AgentEvent = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: ADMIN.user_id,
      payload: {
        changed_fields: ["status", "assignee_id"],
        status: "waiting_for_approval",
      },
    };
    expect(detectHitlMail(event, [PM, ADMIN])).toEqual({
      kind: "approval",
      ticket_id: "t1",
    });
  });

  it("ignores waiting_for_approval for sessions assignee", () => {
    const event: AgentEvent = {
      id: "e2",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: PM.user_id,
      payload: {
        changed_fields: ["status"],
        status: "waiting_for_approval",
      },
    };
    expect(detectHitlMail(event, [PM, ADMIN])).toBeNull();
  });

  it("ignores other status updates", () => {
    const event: AgentEvent = {
      id: "e3",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: ADMIN.user_id,
      payload: { changed_fields: ["status"], status: "in_progress" },
    };
    expect(detectHitlMail(event, [PM, ADMIN])).toBeNull();
  });

  it("detects human mention on comment_added", () => {
    const event: AgentEvent = {
      id: "e4",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "comment_added",
      ticket_id: "t2",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: PM.user_id,
      payload: { comment_id: "c1", mention_user_ids: [ADMIN.user_id] },
    };
    expect(detectHitlMail(event, [PM, ADMIN])).toEqual({
      kind: "mention",
      ticket_id: "t2",
    });
  });

  it("ignores sessions-only mentions", () => {
    const event: AgentEvent = {
      id: "e5",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "comment_added",
      ticket_id: "t2",
      project_id: "p1",
      actor_user_id: "human-1",
      assignee_user_id: PM.user_id,
      payload: { mention_user_ids: [PM.user_id] },
    };
    expect(detectHitlMail(event, [PM, ADMIN])).toBeNull();
  });
});

describe("composeMessage human labels", () => {
  const baseEvent: AgentEvent = {
    id: "e1",
    at: "2026-01-01T00:00:00.000Z",
    event_type: "ticket_updated",
    ticket_id: "4c1fd3a9-94c5-49a2-9bb7-4818900b2084",
    project_id: "8a927848-4411-42a8-8508-f7b8efb3ec60",
    actor_user_id: PM.user_id,
    assignee_user_id: ADMIN.user_id,
    payload: { changed_fields: ["status"], status: "waiting_for_approval" },
  };

  it("puts title in subject and persona/project names in body", () => {
    const msg = composeMessage(
      baseEvent,
      { kind: "approval", ticket_id: baseEvent.ticket_id! },
      "eric@example.com",
      "https://factory.example",
      {
        ticketLabel: "wait 인간 메일 포맷",
        ticketTitle: "wait 인간 메일 포맷",
        ticketNo: "SWF-4C1F",
        projectLabel: "sw-factory",
        assigneeLabel: "eric",
        actorLabel: "pm",
      },
    );
    expect(msg.subject).toBe(
      "[factory HITL] waiting_for_approval · wait 인간 메일 포맷",
    );
    expect(msg.text).toContain("ticket: wait 인간 메일 포맷 (SWF-4C1F)");
    expect(msg.text).toContain("project: sw-factory");
    expect(msg.text).toContain("assignee: eric");
    expect(msg.text).toContain("actor: pm");
    expect(msg.text).not.toContain("assignee_user_id:");
    expect(msg.text).not.toMatch(/^project_id:/m);
  });

  it("falls back to ticket_no in subject when title is absent", () => {
    const msg = composeMessage(
      baseEvent,
      { kind: "mention", ticket_id: baseEvent.ticket_id! },
      "eric@example.com",
      "https://factory.example",
      {
        ticketLabel: "SWF-4C1F",
        ticketNo: "SWF-4C1F",
        projectLabel: "sw-factory",
        assigneeLabel: "eric",
        actorLabel: "pm",
      },
    );
    expect(msg.subject).toBe("[factory HITL] human @mention · SWF-4C1F");
    expect(msg.text).toContain("ticket: SWF-4C1F");
  });
});

describe("maybeSendHitlMail", () => {
  it("resolves ticket title and persona names via fetch + agents.yaml", async () => {
    const dataDir = await tempDir();
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const sendMail: HitlSendMail = async (msg) => {
      sent.push({ to: msg.to, subject: msg.subject, text: msg.text });
    };
    const ticketId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const projectId = "11111111-2222-3333-4444-555555555555";
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith(`/api/tickets/${ticketId}`)) {
        return new Response(
          JSON.stringify({ ticket: { id: ticketId, title: "Approve deploy" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith(`/api/projects/${projectId}`)) {
        return new Response(
          JSON.stringify({ project: { id: projectId, name: "sw-factory" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };
    const event: AgentEvent = {
      id: "e-labels",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: ticketId,
      project_id: projectId,
      actor_user_id: PM.user_id,
      assignee_user_id: ADMIN.user_id,
      payload: {
        changed_fields: ["status"],
        status: "waiting_for_approval",
      },
    };
    await maybeSendHitlMail({
      event,
      agents: [PM, ADMIN],
      dataDir,
      factoryBaseUrl: "https://factory.example",
      sessionCookie: "lt_session=test",
      mail: { to: "eric@example.com", sendMail },
      fetchImpl: fakeFetch,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe(
      "[factory HITL] waiting_for_approval · Approve deploy",
    );
    expect(sent[0]!.text).toContain("ticket: Approve deploy (SWF-AAAA)");
    expect(sent[0]!.text).toContain("project: sw-factory");
    expect(sent[0]!.text).toContain("assignee: eric");
    expect(sent[0]!.text).toContain("actor: pm");
  });

  it("falls back to issueKey when ticket GET fails", async () => {
    const dataDir = await tempDir();
    const sent: Array<{ subject: string; text: string }> = [];
    const sendMail: HitlSendMail = async (msg) => {
      sent.push({ subject: msg.subject, text: msg.text });
    };
    const ticketId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const projectId = "p-fallback";
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/tickets/")) {
        return new Response("boom", { status: 500 });
      }
      if (url.endsWith(`/api/projects/${projectId}`)) {
        return new Response(
          JSON.stringify({ project: { id: projectId, name: "aura" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };
    await maybeSendHitlMail({
      event: {
        id: "e-fb",
        at: "2026-01-01T00:00:00.000Z",
        event_type: "comment_added",
        ticket_id: ticketId,
        project_id: projectId,
        actor_user_id: "unknown-user",
        assignee_user_id: ADMIN.user_id,
        payload: { mention_user_ids: [ADMIN.user_id] },
      },
      agents: [PM, ADMIN],
      dataDir,
      factoryBaseUrl: "https://factory.example",
      sessionCookie: "lt_session=test",
      mail: { to: "eric@example.com", sendMail },
      fetchImpl: fakeFetch,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("[factory HITL] human @mention · AUR-BBBB");
    expect(sent[0]!.text).toContain("ticket: AUR-BBBB");
    expect(sent[0]!.text).toContain("project: aura");
    expect(sent[0]!.text).toContain("actor: (unknown) unknown-");
  });

  it("sends once then dedupes within TTL", async () => {
    const dataDir = await tempDir();
    const sent: Array<{ to: string; subject: string }> = [];
    const sendMail: HitlSendMail = async (msg) => {
      sent.push({ to: msg.to, subject: msg.subject });
    };
    const mail: HitlMailConfig = {
      to: "eric@example.com",
      ttlMs: 60_000,
      sendMail,
    };
    const event: AgentEvent = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: ADMIN.user_id,
      payload: {
        changed_fields: ["status"],
        status: "waiting_for_approval",
      },
    };
    await maybeSendHitlMail({
      event,
      agents: [PM, ADMIN],
      dataDir,
      factoryBaseUrl: "https://factory.example",
      mail,
    });
    await maybeSendHitlMail({
      event: { ...event, id: "e2" },
      agents: [PM, ADMIN],
      dataDir,
      factoryBaseUrl: "https://factory.example",
      mail,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("eric@example.com");
    expect(sent[0]!.subject).toContain("waiting_for_approval");
  });

  it("no-ops when mail config missing", async () => {
    const dataDir = await tempDir();
    const event: AgentEvent = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "comment_added",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: PM.user_id,
      payload: { mention_user_ids: [ADMIN.user_id] },
    };
    await maybeSendHitlMail({
      event,
      agents: [PM, ADMIN],
      dataDir,
      factoryBaseUrl: "https://factory.example",
      mail: undefined,
    });
  });

  it("swallows send errors", async () => {
    const dataDir = await tempDir();
    const mail: HitlMailConfig = {
      to: "eric@example.com",
      sendMail: async () => {
        throw new Error("gmail down");
      },
    };
    const event: AgentEvent = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "comment_added",
      ticket_id: "t1",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: PM.user_id,
      payload: { mention_user_ids: [ADMIN.user_id] },
    };
    await expect(
      maybeSendHitlMail({
        event,
        agents: [PM, ADMIN],
        dataDir,
        factoryBaseUrl: "https://factory.example",
        mail,
      }),
    ).resolves.toBeUndefined();
  });

  it("sends via Cloudflare Worker POST /api/agent/hitl-mail when Gmail OAuth is omitted", async () => {
    const dataDir = await tempDir();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true, message_id: "<1@askwho.net>" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const event: AgentEvent = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      event_type: "ticket_updated",
      ticket_id: "t-cf-1234",
      project_id: "p1",
      actor_user_id: PM.user_id,
      assignee_user_id: ADMIN.user_id,
      payload: {
        changed_fields: ["status"],
        status: "waiting_for_approval",
      },
    };
    await maybeSendHitlMail({
      event,
      agents: [PM, ADMIN],
      dataDir,
      factoryBaseUrl: "https://factory.askwho.net/",
      sessionCookie: "lt_session=test-session",
      mail: {
        to: "eric@example.com",
        from: "hitl@askwho.net",
      },
      fetchImpl: fakeFetch,
    });
    const mailCall = calls.find((c) => c.url.endsWith("/api/agent/hitl-mail"));
    expect(mailCall).toBeTruthy();
    const headers = mailCall!.init?.headers as Record<string, string>;
    expect(headers.cookie).toBe("lt_session=test-session");
    const parsed = JSON.parse(String(mailCall!.init?.body)) as Record<string, string>;
    expect(parsed.to).toBe("eric@example.com");
    expect(parsed.from).toBe("hitl@askwho.net");
    expect(parsed.subject).toContain("waiting_for_approval");
  });
});

describe("tick + hitl mail", () => {
  async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  function startMockCursor() {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "";
      if (req.method === "POST" && url === "/sessions") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ agent_id: "agent-1" }));
        return;
      }
      if (req.method === "POST" && url.startsWith("/sessions/") && url.endsWith("/prompt")) {
        await readJson(req);
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ run_id: "run-1", status: "accepted" }));
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

  function startMockFactory(events: AgentEvent[]) {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/agent/events") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events }));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/projects/p1") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ project: { id: "p1", name: "sw-factory" } }));
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

  it("advances ack when hitl send throws", async () => {
    const dataDir = await tempDir();
    const cursor = await startMockCursor();
    const events: AgentEvent[] = [
      {
        id: "ev-hitl",
        at: "2026-01-01T00:00:00.000Z",
        event_type: "comment_added",
        ticket_id: "t-hitl",
        project_id: "p1",
        actor_user_id: PM.user_id,
        assignee_user_id: PM.user_id,
        payload: { mention_user_ids: [ADMIN.user_id] },
      },
    ];
    const factory = await startMockFactory(events);
    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=test",
      agents: [PM, ADMIN],
      prompts,
      debounceMs: 0,
      pollLimit: 50,
      retryMaxAttempts: 3,
      hitlMail: {
        to: "eric@example.com",
        sendMail: async () => {
          throw new Error("boom");
        },
      },
    };
    try {
      const result = await tick({ config });
      expect(result.acked_id).toBe("ev-hitl");
      const cp = await loadCheckpoint(dataDir);
      expect(cp.acked_id).toBe("ev-hitl");
    } finally {
      await cursor.close();
      await factory.close();
    }
  });

  it("posts HITL mail to Cloudflare Worker /api/agent/hitl-mail by default when Gmail OAuth is omitted", async () => {
    const dataDir = await tempDir();
    const cursor = await startMockCursor();
    const receivedMails: Array<{ body: Record<string, unknown>; cookie: string | undefined }> = [];
    const events: AgentEvent[] = [
      {
        id: "ev-cf-hitl",
        at: "2026-01-01T00:00:00.000Z",
        event_type: "comment_added",
        ticket_id: "t-cf-hitl",
        project_id: "p1",
        actor_user_id: PM.user_id,
        assignee_user_id: PM.user_id,
        payload: { mention_user_ids: [ADMIN.user_id] },
      },
    ];
    const factoryServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/agent/events") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/agent/hitl-mail") {
        const body = await readJson(req);
        receivedMails.push({ body, cookie: req.headers.cookie });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, message_id: "<test@askwho.net>" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const factory = await new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
      factoryServer.listen(0, "127.0.0.1", () => {
        const addr = factoryServer.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        resolve({
          port,
          close: () => new Promise((r) => factoryServer.close(() => r())),
        });
      });
    });

    const config: GatewayConfig = {
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      cursorBaseUrl: `http://127.0.0.1:${cursor.port}`,
      dataDir,
      sessionCookie: "lt_session=cf-gateway-cookie",
      agents: [PM, ADMIN],
      prompts,
      debounceMs: 0,
      pollLimit: 50,
      retryMaxAttempts: 3,
      hitlMail: {
        to: "eric@example.com",
        from: "hitl@askwho.net",
      },
    };
    try {
      const result = await tick({ config });
      expect(result.acked_id).toBe("ev-cf-hitl");
      expect(receivedMails).toHaveLength(1);
      expect(receivedMails[0]!.cookie).toBe("lt_session=cf-gateway-cookie");
      expect(receivedMails[0]!.body.to).toBe("eric@example.com");
      expect(receivedMails[0]!.body.from).toBe("hitl@askwho.net");
      expect(String(receivedMails[0]!.body.subject)).toContain("human @mention");
    } finally {
      await cursor.close();
      await factory.close();
    }
  });
});
