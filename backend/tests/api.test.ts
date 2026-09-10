import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

type Json = Record<string, unknown>;

async function request(
  path: string,
  init: RequestInit = {},
  cookie?: string,
): Promise<{ status: number; json: Json; headers: Headers }> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const req = new Request(`http://example.com${path}`, { ...init, headers });
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

function cookieFrom(headers: Headers): string {
  const set = headers.get("Set-Cookie") ?? "";
  const m = /lt_session=[^;]+/.exec(set);
  return m?.[0] ?? "";
}

async function register(name: string) {
  const email = `${name.toLowerCase()}_${crypto.randomUUID()}@example.com`;
  const res = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "password123", name }),
  });
  expect(res.status).toBe(201);
  const user = res.json.user as Json;
  return { cookie: cookieFrom(res.headers), email, userId: user.id as string };
}

async function createClient(cookie: string, name = "Acme") {
  const res = await request(
    "/api/clients",
    { method: "POST", body: JSON.stringify({ name, description: "org" }) },
    cookie,
  );
  expect(res.status).toBe(201);
  return (res.json.client as Json).id as string;
}

describe("health", () => {
  it("returns ok", async () => {
    const res = await request("/api/health");
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
  });
});

describe("auth", () => {
  it("registers, me, logout", async () => {
    const { cookie, email } = await register("Ada");

    const me = await request("/api/auth/me", {}, cookie);
    expect(me.status).toBe(200);
    expect((me.json.user as Json).email).toBe(email);

    const logout = await request("/api/auth/logout", { method: "POST" }, cookie);
    expect(logout.status).toBe(200);

    const me2 = await request("/api/auth/me", {}, cookie);
    expect(me2.status).toBe(401);
  });

  it("rejects bad login", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nope@example.com", password: "wrongpass" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("clients", () => {
  it("CRUD with membership and project linkage", async () => {
    const a = await register("Alice");
    const b = await register("Bob");

    const created = await request(
      "/api/clients",
      { method: "POST", body: JSON.stringify({ name: "Acme Corp" }) },
      a.cookie,
    );
    expect(created.status).toBe(201);
    const clientId = (created.json.client as Json).id as string;

    const denied = await request(`/api/clients/${clientId}`, {}, b.cookie);
    expect(denied.status).toBe(403);

    const listed = await request("/api/clients", {}, a.cookie);
    expect(listed.status).toBe(200);
    expect((listed.json.clients as Json[]).some((c) => c.id === clientId)).toBe(true);

    const projDenied = await request(
      "/api/projects",
      {
        method: "POST",
        body: JSON.stringify({ name: "Secret", client_id: clientId }),
      },
      b.cookie,
    );
    expect(projDenied.status).toBe(403);

    const proj = await request(
      "/api/projects",
      {
        method: "POST",
        body: JSON.stringify({ name: "Website", client_id: clientId }),
      },
      a.cookie,
    );
    expect(proj.status).toBe(201);
    expect((proj.json.project as Json).client_id).toBe(clientId);

    const underClient = await request(`/api/clients/${clientId}/projects`, {}, a.cookie);
    expect(underClient.status).toBe(200);
    expect((underClient.json.projects as Json[]).length).toBe(1);

    const missingClient = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "NoClient" }) },
      a.cookie,
    );
    expect(missingClient.status).toBe(400);
  });
});

describe("projects and tickets", () => {
  it("enforces membership and supports CRUD, kanban, timeline", async () => {
    const a = await register("Alice");
    const b = await register("Bob");
    const clientId = await createClient(a.cookie);

    const created = await request(
      "/api/projects",
      {
        method: "POST",
        body: JSON.stringify({ name: "Alpha", description: "d", client_id: clientId }),
      },
      a.cookie,
    );
    expect(created.status).toBe(201);
    const projectId = (created.json.project as Json).id as string;

    const denied = await request(`/api/projects/${projectId}`, {}, b.cookie);
    expect(denied.status).toBe(403);

    const t = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({ title: "Task 1", type: "task", status: "todo" }),
      },
      a.cookie,
    );
    expect(t.status).toBe(201);
    const ticketId = (t.json.ticket as Json).id as string;

    const forbidden = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Nope", type: "task" }) },
      b.cookie,
    );
    expect(forbidden.status).toBe(403);

    const patched = await request(
      `/api/tickets/${ticketId}`,
      { method: "PATCH", body: JSON.stringify({ status: "done", sort_order: 0 }) },
      a.cookie,
    );
    expect(patched.status).toBe(200);
    expect((patched.json.ticket as Json).status).toBe("done");

    const ms = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({
          title: "M1",
          type: "milestone",
          status: "todo",
          date_from: "2026-09-01",
          date_to: "2026-09-30",
        }),
      },
      a.cookie,
    );
    expect(ms.status).toBe(201);

    const kanban = await request(`/api/projects/${projectId}/kanban`, {}, a.cookie);
    expect(kanban.status).toBe(200);
    expect(kanban.json.columns).toBeTruthy();

    const timeline = await request(`/api/projects/${projectId}/timeline`, {}, a.cookie);
    expect(timeline.status).toBe(200);
    expect(Array.isArray(timeline.json.items)).toBe(true);
    expect((timeline.json.items as Json[]).length).toBeGreaterThan(0);
  });
});

describe("M6 collaboration", () => {
  it("manages client and project members", async () => {
    const owner = await register("Owner");
    const invitee = await register("Invitee");
    const stranger = await register("Stranger");
    const clientId = await createClient(owner.cookie, "MemberCo");

    const listEmpty = await request(`/api/clients/${clientId}/members`, {}, owner.cookie);
    expect(listEmpty.status).toBe(200);
    expect((listEmpty.json.members as Json[]).length).toBe(1);

    const memberDenied = await request(
      `/api/clients/${clientId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: invitee.userId, role: "member" }),
      },
      invitee.cookie,
    );
    expect(memberDenied.status).toBe(403);

    const added = await request(
      `/api/clients/${clientId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: invitee.userId, role: "member" }),
      },
      owner.cookie,
    );
    expect(added.status).toBe(201);
    expect((added.json.member as Json).user_id).toBe(invitee.userId);

    const listed = await request(`/api/clients/${clientId}/members`, {}, invitee.cookie);
    expect(listed.status).toBe(200);
    expect((listed.json.members as Json[]).length).toBe(2);

    const proj = await request(
      "/api/projects",
      {
        method: "POST",
        body: JSON.stringify({ name: "TeamProj", client_id: clientId }),
      },
      owner.cookie,
    );
    const projectId = (proj.json.project as Json).id as string;

    const projAddStranger = await request(
      `/api/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: stranger.userId, role: "member" }),
      },
      owner.cookie,
    );
    expect(projAddStranger.status).toBe(400);

    const projAdd = await request(
      `/api/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: invitee.userId, role: "member" }),
      },
      owner.cookie,
    );
    expect(projAdd.status).toBe(201);

    const projMembers = await request(`/api/projects/${projectId}/members`, {}, invitee.cookie);
    expect(projMembers.status).toBe(200);
    expect((projMembers.json.members as Json[]).length).toBe(2);

    const removeLastOwner = await request(
      `/api/clients/${clientId}/members/${owner.userId}`,
      { method: "DELETE" },
      owner.cookie,
    );
    expect(removeLastOwner.status).toBe(400);

    const removed = await request(
      `/api/projects/${projectId}/members/${invitee.userId}`,
      { method: "DELETE" },
      owner.cookie,
    );
    expect(removed.status).toBe(200);

    const afterRemove = await request(`/api/projects/${projectId}`, {}, invitee.cookie);
    expect(afterRemove.status).toBe(403);
  });

  it("supports assignee, due_at, priority and delete guard", async () => {
    const owner = await register("Owner2");
    const member = await register("Member2");
    const clientId = await createClient(owner.cookie, "CollabCo");

    await request(
      `/api/clients/${clientId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: member.userId, role: "member" }),
      },
      owner.cookie,
    );

    const proj = await request(
      "/api/projects",
      {
        method: "POST",
        body: JSON.stringify({ name: "Collab", client_id: clientId }),
      },
      owner.cookie,
    );
    const projectId = (proj.json.project as Json).id as string;

    await request(
      `/api/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: member.userId, role: "member" }),
      },
      owner.cookie,
    );

    const created = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({
          title: "Assigned",
          type: "task",
          priority: "high",
          assignee_id: member.userId,
          due_at: "2026-10-01",
        }),
      },
      owner.cookie,
    );
    expect(created.status).toBe(201);
    const ticket = created.json.ticket as Json;
    expect(ticket.priority).toBe("high");
    expect(ticket.assignee_id).toBe(member.userId);
    expect(ticket.due_at).toBe("2026-10-01");
    const ticketId = ticket.id as string;

    const patched = await request(
      `/api/tickets/${ticketId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ priority: "urgent", due_at: "2026-10-15", assignee_id: null }),
      },
      member.cookie,
    );
    expect(patched.status).toBe(200);
    expect((patched.json.ticket as Json).priority).toBe("urgent");
    expect((patched.json.ticket as Json).assignee_id).toBeNull();
    expect((patched.json.ticket as Json).due_at).toBe("2026-10-15");

    await request(
      `/api/tickets/${ticketId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ assignee_id: member.userId }),
      },
      member.cookie,
    );
    const mine = await request(
      `/api/projects/${projectId}/tickets?assignee_id=me`,
      {},
      member.cookie,
    );
    expect(mine.status).toBe(200);
    expect((mine.json.tickets as Json[]).some((t) => t.id === ticketId)).toBe(true);

    const memberTicket = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Mine", type: "task" }) },
      member.cookie,
    );
    const memberTicketId = (memberTicket.json.ticket as Json).id as string;

    const memberDeleteOwn = await request(
      `/api/tickets/${memberTicketId}`,
      { method: "DELETE" },
      member.cookie,
    );
    expect(memberDeleteOwn.status).toBe(200);

    const ownerTicket = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Owner's", type: "task" }) },
      owner.cookie,
    );
    const ownerTicketId = (ownerTicket.json.ticket as Json).id as string;

    const memberCannotDelete = await request(
      `/api/tickets/${ownerTicketId}`,
      { method: "DELETE" },
      member.cookie,
    );
    expect(memberCannotDelete.status).toBe(403);

    const ownerCanDelete = await request(
      `/api/tickets/${ownerTicketId}`,
      { method: "DELETE" },
      owner.cookie,
    );
    expect(ownerCanDelete.status).toBe(200);
  });
});

describe("M7 scale and durability", () => {
  it("paginates tickets and filters archived done on kanban", async () => {
    const { cookie } = await register("Pager");
    const clientId = await createClient(cookie, "PageCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "Paged", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;

    for (let i = 0; i < 5; i++) {
      const res = await request(
        `/api/projects/${projectId}/tickets`,
        {
          method: "POST",
          body: JSON.stringify({ title: `T${i}`, type: "task", status: "todo" }),
        },
        cookie,
      );
      expect(res.status).toBe(201);
    }

    const page1 = await request(
      `/api/projects/${projectId}/tickets?limit=2`,
      {},
      cookie,
    );
    expect(page1.status).toBe(200);
    expect((page1.json.tickets as Json[]).length).toBe(2);
    expect(typeof page1.json.next_cursor).toBe("string");

    const page2 = await request(
      `/api/projects/${projectId}/tickets?limit=2&cursor=${encodeURIComponent(page1.json.next_cursor as string)}`,
      {},
      cookie,
    );
    expect(page2.status).toBe(200);
    expect((page2.json.tickets as Json[]).length).toBe(2);
    const ids1 = (page1.json.tickets as Json[]).map((t) => t.id);
    const ids2 = (page2.json.tickets as Json[]).map((t) => t.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);

    const oldDone = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({ title: "OldDone", type: "task", status: "done" }),
      },
      cookie,
    );
    const oldDoneId = (oldDone.json.ticket as Json).id as string;
    await env.DB.prepare(
      `UPDATE tickets SET updated_at = ? WHERE id = ?`,
    )
      .bind("2020-01-01T00:00:00.000Z", oldDoneId)
      .run();

    const recentDone = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({ title: "RecentDone", type: "task", status: "done" }),
      },
      cookie,
    );
    expect(recentDone.status).toBe(201);

    const kanban = await request(`/api/projects/${projectId}/kanban`, {}, cookie);
    expect(kanban.status).toBe(200);
    const doneCol = (kanban.json.columns as Record<string, Json[]>).done;
    expect(doneCol.some((t) => t.id === oldDoneId)).toBe(false);
    expect(doneCol.some((t) => t.title === "RecentDone")).toBe(true);

    const archived = await request(
      `/api/projects/${projectId}/kanban?include_archived=true`,
      {},
      cookie,
    );
    expect(
      ((archived.json.columns as Record<string, Json[]>).done).some((t) => t.id === oldDoneId),
    ).toBe(true);
  });

  it("supports direct upload url + confirm and session cleanup", async () => {
    const { cookie, userId } = await register("Uploader");
    const clientId = await createClient(cookie, "UpCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "Up", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;
    const ticket = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Big", type: "task" }) },
      cookie,
    );
    const ticketId = (ticket.json.ticket as Json).id as string;

    const urlRes = await request(
      `/api/tickets/${ticketId}/files/upload-url`,
      {
        method: "POST",
        body: JSON.stringify({
          filename: "big.bin",
          mime: "application/octet-stream",
          size: 11,
        }),
      },
      cookie,
    );
    expect(urlRes.status).toBe(201);
    const uploadUrl = urlRes.json.upload_url as string;
    const r2Key = urlRes.json.r2_key as string;
    expect(uploadUrl).toBeTruthy();
    expect(r2Key).toBeTruthy();

    const put = await request(uploadUrl as string, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: "hello-world",
    });
    expect(put.status).toBe(204);

    const confirm = await request(
      `/api/tickets/${ticketId}/files/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ r2_key: r2Key, filename: "big.bin", mime: "application/octet-stream", size: 11 }),
      },
      cookie,
    );
    expect(confirm.status).toBe(201);
    expect((confirm.json.file as Json).filename).toBe("big.bin");

    const expiredId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(expiredId, userId, "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z")
      .run();

    const worker = await import("../src/index");
    await worker.default.scheduled(
      { scheduledTime: Date.now(), cron: "0 * * * *", noRetry() {} },
      env,
      { waitUntil() {}, passThroughOnException() {} },
    );

    const gone = await env.DB.prepare(`SELECT id FROM sessions WHERE id = ?`)
      .bind(expiredId)
      .first();
    expect(gone).toBeNull();
  });
});

describe("M8 concurrency and history", () => {
  it("returns 409 on version conflict and records activities", async () => {
    const { cookie } = await register("Concurrency");
    const clientId = await createClient(cookie, "OccCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "Occ", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;
    const created = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "V1", type: "task", status: "todo" }) },
      cookie,
    );
    const ticketId = (created.json.ticket as Json).id as string;
    expect((created.json.ticket as Json).version).toBe(1);

    const ok = await request(
      `/api/tickets/${ticketId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress", version: 1 }),
      },
      cookie,
    );
    expect(ok.status).toBe(200);
    expect((ok.json.ticket as Json).version).toBe(2);
    expect((ok.json.ticket as Json).status).toBe("in_progress");

    const conflict = await request(
      `/api/tickets/${ticketId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "done", version: 1 }),
      },
      cookie,
    );
    expect(conflict.status).toBe(409);

    const activities = await request(`/api/tickets/${ticketId}/activities`, {}, cookie);
    expect(activities.status).toBe(200);
    const rows = activities.json.activities as Json[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((a) => a.field === "status" && a.new_val === "in_progress")).toBe(true);
  });
});

describe("account profile and password", () => {
  it("patches name/email and changes password", async () => {
    const { cookie, email } = await register("Pat");
    const patch = await request(
      "/api/users/me",
      { method: "PATCH", body: JSON.stringify({ name: "Patricia", email: `patricia_${crypto.randomUUID()}@example.com` }) },
      cookie,
    );
    expect(patch.status).toBe(200);
    expect((patch.json.user as Json).name).toBe("Patricia");
    expect((patch.json.user as Json).email).not.toBe(email);

    const badPw = await request(
      "/api/auth/password",
      {
        method: "POST",
        body: JSON.stringify({ current_password: "wrong", new_password: "newpassword1" }),
      },
      cookie,
    );
    expect(badPw.status).toBe(401);

    const okPw = await request(
      "/api/auth/password",
      {
        method: "POST",
        body: JSON.stringify({ current_password: "password123", new_password: "newpassword1" }),
      },
      cookie,
    );
    expect(okPw.status).toBe(200);

    const loginOld = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: (patch.json.user as Json).email, password: "password123" }),
    });
    expect(loginOld.status).toBe(401);

    const loginNew = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: (patch.json.user as Json).email, password: "newpassword1" }),
    });
    expect(loginNew.status).toBe(200);
  });
});

describe("search", () => {
  it("finds members-scoped clients, projects, and tickets by q", async () => {
    const { cookie } = await register("Searcher");
    const other = await register("Outsider");
    const clientId = await createClient(cookie, "SearchSpace");
    const outsiderClient = await createClient(other.cookie, "HiddenSpace");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "AlphaSearchProj", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;
    await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "UniqueNeedle Ticket", type: "task" }) },
      cookie,
    );
    await request(
      "/api/projects",
      {
        method: "POST",
        body: JSON.stringify({ name: "HiddenProj", client_id: outsiderClient }),
      },
      other.cookie,
    );

    const empty = await request("/api/search?q=", {}, cookie);
    expect(empty.status).toBe(400);

    const byTicket = await request("/api/search?q=UniqueNeedle", {}, cookie);
    expect(byTicket.status).toBe(200);
    const tickets = byTicket.json.tickets as Json[];
    expect(tickets.some((t) => t.title === "UniqueNeedle Ticket")).toBe(true);

    const bySpace = await request("/api/search?q=SearchSpace", {}, cookie);
    expect((bySpace.json.clients as Json[]).some((c) => c.name === "SearchSpace")).toBe(true);
    expect((bySpace.json.clients as Json[]).some((c) => c.name === "HiddenSpace")).toBe(false);

    const byProj = await request("/api/search?q=AlphaSearch", {}, cookie);
    expect((byProj.json.projects as Json[]).some((p) => p.name === "AlphaSearchProj")).toBe(true);
    expect((byProj.json.projects as Json[]).some((p) => p.name === "HiddenProj")).toBe(false);
  });
});

describe("comments and files", () => {
  it("adds comment and uploads file via R2", async () => {
    const { cookie } = await register("Cara");
    const clientId = await createClient(cookie, "FilesCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "Files", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;
    const ticket = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "With file", type: "task" }) },
      cookie,
    );
    const ticketId = (ticket.json.ticket as Json).id as string;

    const comment = await request(
      `/api/tickets/${ticketId}/comments`,
      { method: "POST", body: JSON.stringify({ body: "hello" }) },
      cookie,
    );
    expect(comment.status).toBe(201);

    const form = new FormData();
    form.append("file", new File(["hello-bytes"], "note.txt", { type: "text/plain" }));
    const upload = await request(
      `/api/tickets/${ticketId}/files`,
      { method: "POST", body: form },
      cookie,
    );
    expect(upload.status).toBe(201);
    const fileId = (upload.json.file as Json).id as string;

    const dl = await request(`/api/files/${fileId}`, {}, cookie);
    expect(dl.status).toBe(200);
    expect(dl.json.raw).toBe("hello-bytes");
  });
});
