import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { extractMentionHandles } from "../src/lib/mentions";

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

async function register(name: string, opts: { admin?: boolean } = {}) {
  const email = `${name.toLowerCase()}_${crypto.randomUUID()}@example.com`;
  const res = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "password123", name }),
  });
  expect(res.status).toBe(201);
  const user = res.json.user as Json;
  expect(user.is_admin).toBe(false);
  if (opts.admin) {
    await env.DB.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).bind(user.id).run();
  }
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
    const a = await register("Alice", { admin: true });
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
    const a = await register("Alice", { admin: true });
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
        body: JSON.stringify({ title: "Task 1", type: "task", status: "backlog" }),
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
          status: "backlog",
          date_from: "2026-09-01",
          date_to: "2026-09-30",
        }),
      },
      a.cookie,
    );
    expect(ms.status).toBe(201);

    const statuses = await request(`/api/projects/${projectId}/statuses`, {}, a.cookie);
    expect(statuses.status).toBe(200);
    expect((statuses.json.statuses as Json[]).map((s) => s.key)).toEqual([
      "backlog",
      "in_progress",
      "review",
      "deploying_test",
      "qa",
      "deploying_prod",
      "done",
      "blocked",
      "waiting_for_approval",
    ]);

    const kanban = await request(`/api/projects/${projectId}/kanban`, {}, a.cookie);
    expect(kanban.status).toBe(200);
    expect(kanban.json.columns).toBeTruthy();
    expect((kanban.json.statuses as Json[]).length).toBe(9);
    expect((kanban.json.columns as Record<string, Json[]>).backlog).toBeDefined();
    expect((kanban.json.columns as Record<string, Json[]>).review).toBeDefined();

    const timeline = await request(`/api/projects/${projectId}/timeline`, {}, a.cookie);
    expect(timeline.status).toBe(200);
    expect(Array.isArray(timeline.json.items)).toBe(true);
    expect((timeline.json.items as Json[]).length).toBeGreaterThan(0);
  });
});

describe("M6 collaboration", () => {
  it("manages client and project members", async () => {
    const owner = await register("Owner", { admin: true });
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
    for (const m of projMembers.json.members as Json[]) {
      expect(m).toHaveProperty("lane");
    }

    const laneDenied = await request(
      `/api/projects/${projectId}/members/${invitee.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ lane: "developer" }),
      },
      invitee.cookie,
    );
    expect(laneDenied.status).toBe(403);

    const laneBad = await request(
      `/api/projects/${projectId}/members/${invitee.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ lane: "hacker" }),
      },
      owner.cookie,
    );
    expect(laneBad.status).toBe(400);

    const laneSet = await request(
      `/api/projects/${projectId}/members/${invitee.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ lane: "developer" }),
      },
      owner.cookie,
    );
    expect(laneSet.status).toBe(200);
    expect((laneSet.json.member as Json).lane).toBe("developer");

    const laneClear = await request(
      `/api/projects/${projectId}/members/${invitee.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ lane: null }),
      },
      owner.cookie,
    );
    expect(laneClear.status).toBe(200);
    expect((laneClear.json.member as Json).lane).toBeNull();

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
    const owner = await register("Owner2", { admin: true });
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

    const createdByMember = await request(
      `/api/projects/${projectId}/tickets?created_by=me`,
      {},
      member.cookie,
    );
    expect(createdByMember.status).toBe(200);
    expect(
      (createdByMember.json.tickets as Json[]).some((t) => t.id === ticketId),
    ).toBe(false);

    const memberTicket = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Mine", type: "task" }) },
      member.cookie,
    );
    const memberTicketId = (memberTicket.json.ticket as Json).id as string;

    const createdByMe = await request(
      `/api/projects/${projectId}/tickets?created_by=me`,
      {},
      member.cookie,
    );
    expect(createdByMe.status).toBe(200);
    expect(
      (createdByMe.json.tickets as Json[]).some((t) => t.id === memberTicketId),
    ).toBe(true);

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
    const { cookie } = await register("Pager", { admin: true });
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
          body: JSON.stringify({ title: `T${i}`, type: "task", status: "backlog" }),
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
    const { cookie, userId } = await register("Uploader", { admin: true });
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
    const { cookie } = await register("Concurrency", { admin: true });
    const clientId = await createClient(cookie, "OccCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "Occ", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;
    const created = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "V1", type: "task", status: "backlog" }) },
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
  it("searches users by name or email for typeahead", async () => {
    const a = await register("AliceSearch");
    const b = await register("BobSearch");
    const short = await request("/api/users/search?q=a", {}, a.cookie);
    expect(short.status).toBe(400);

    const byName = await request("/api/users/search?q=BobS", {}, a.cookie);
    expect(byName.status).toBe(200);
    const nameHits = byName.json.users as Json[];
    expect(nameHits.some((u) => u.id === b.userId)).toBe(true);
    expect(nameHits.every((u) => "email" in u && "name" in u && "id" in u)).toBe(true);
    expect(nameHits.every((u) => !("is_admin" in u))).toBe(true);

    const emailPrefix = b.email.slice(0, 8);
    const byEmail = await request(
      `/api/users/search?q=${encodeURIComponent(emailPrefix)}`,
      {},
      a.cookie,
    );
    expect(byEmail.status).toBe(200);
    expect((byEmail.json.users as Json[]).some((u) => u.id === b.userId)).toBe(true);

    const anon = await request("/api/users/search?q=Bob");
    expect(anon.status).toBe(401);
  });

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
    const { cookie } = await register("Searcher", { admin: true });
    const other = await register("Outsider", { admin: true });
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
    const { cookie } = await register("Cara", { admin: true });
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

describe("comment @mentions", () => {
  it("extracts @Name handles case-insensitively and skips email mid-@", () => {
    expect(extractMentionHandles("hey @pm and @PM please")).toEqual(["pm"]);
    expect(extractMentionHandles("@Pm review")).toEqual(["pm"]);
    expect(extractMentionHandles("ping @qa,@ta")).toEqual(["qa", "ta"]);
    expect(extractMentionHandles("mail user@pm.com ok")).toEqual([]);
    expect(extractMentionHandles("no mentions here")).toEqual([]);
  });

  it("puts mention_user_ids on comment_added for project members", async () => {
    const owner = await register("MentionOwner", { admin: true });
    const pm = await register("pm");
    const outsider = await register("pm"); // same name, not a project member

    const clientId = await createClient(owner.cookie, "MentionCo");
    const clientAdd = await request(
      `/api/clients/${clientId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: pm.userId, role: "member" }),
      },
      owner.cookie,
    );
    expect(clientAdd.status).toBe(201);

    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "MentionProj", client_id: clientId }) },
      owner.cookie,
    );
    const projectId = (proj.json.project as Json).id as string;

    const invite = await request(
      `/api/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: pm.userId, role: "member", lane: "pm" }),
      },
      owner.cookie,
    );
    expect(invite.status).toBe(201);

    const ticket = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Need PM", type: "task" }) },
      owner.cookie,
    );
    const ticketId = (ticket.json.ticket as Json).id as string;

    const baseline = await request("/api/agent/events?limit=500", {}, owner.cookie);
    const afterId = (baseline.json.events as Json[]).at(-1)?.id as string | undefined;

    const comment = await request(
      `/api/tickets/${ticketId}/comments`,
      { method: "POST", body: JSON.stringify({ body: "Please look @PM thanks" }) },
      owner.cookie,
    );
    expect(comment.status).toBe(201);

    const pullPath = afterId
      ? `/api/agent/events?after_id=${afterId}&limit=50`
      : "/api/agent/events?limit=50";
    const pull = await request(pullPath, {}, owner.cookie);
    const events = (pull.json.events as Json[]).filter(
      (e) => e.ticket_id === ticketId && e.event_type === "comment_added",
    );
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as Json).mention_user_ids).toEqual([pm.userId]);
    expect((events[0]!.payload as Json).mention_user_ids).not.toContain(outsider.userId);
  });
});

describe("A1 agent event log", () => {
  it("requires auth for pull and rejects unknown after_id", async () => {
    const anon = await request("/api/agent/events");
    expect(anon.status).toBe(401);

    const { cookie } = await register("GatewayBot");
    const bad = await request(
      "/api/agent/events?after_id=does-not-exist",
      {},
      cookie,
    );
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe("invalid_after_id");
  });

  it("appends on ticket/comment mutate and supports after_id tail", async () => {
    const { cookie, userId } = await register("AgentActor", { admin: true });
    const clientId = await createClient(cookie, "AgentCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "AgentProj", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;

    const baseline = await request("/api/agent/events?limit=500", {}, cookie);
    expect(baseline.status).toBe(200);
    const baselineEvents = baseline.json.events as Json[];
    const afterId = baselineEvents.at(-1)?.id as string | undefined;

    const created = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({ title: "Wake me", type: "task", assignee_id: userId }),
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const ticketId = (created.json.ticket as Json).id as string;

    const patched = await request(
      `/api/tickets/${ticketId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress", version: 1 }),
      },
      cookie,
    );
    expect(patched.status).toBe(200);

    const comment = await request(
      `/api/tickets/${ticketId}/comments`,
      { method: "POST", body: JSON.stringify({ body: "ping agent" }) },
      cookie,
    );
    expect(comment.status).toBe(201);
    const commentId = (comment.json.comment as Json).id as string;

    const deleted = await request(`/api/tickets/${ticketId}`, { method: "DELETE" }, cookie);
    expect(deleted.status).toBe(200);

    const pullPath = afterId
      ? `/api/agent/events?after_id=${afterId}&limit=50`
      : "/api/agent/events?limit=50";
    const pull = await request(pullPath, {}, cookie);
    expect(pull.status).toBe(200);
    const events = (pull.json.events as Json[]).filter((e) => e.ticket_id === ticketId);
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.event_type)).toEqual([
      "ticket_created",
      "ticket_updated",
      "comment_added",
      "ticket_deleted",
    ]);

    expect(events[0].project_id).toBe(projectId);
    expect(events[0].actor_user_id).toBe(userId);
    expect(events[0].assignee_user_id).toBe(userId);

    const updatedPayload = events[1].payload as Json;
    expect(updatedPayload.changed_fields).toEqual(expect.arrayContaining(["status"]));
    expect((events[2].payload as Json).comment_id).toBe(commentId);

    const mid = events[1].id as string;
    const page = await request(`/api/agent/events?after_id=${mid}&limit=50`, {}, cookie);
    expect(page.status).toBe(200);
    const pageTicketEvents = (page.json.events as Json[]).filter(
      (e) => e.ticket_id === ticketId,
    );
    expect(pageTicketEvents.map((e) => e.event_type)).toEqual([
      "comment_added",
      "ticket_deleted",
    ]);
  });

  it("does not append ticket_updated when PATCH changes nothing", async () => {
    const { cookie } = await register("NoopPatch", { admin: true });
    const clientId = await createClient(cookie, "NoopCo");
    const proj = await request(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "Noop", client_id: clientId }) },
      cookie,
    );
    const projectId = (proj.json.project as Json).id as string;
    const created = await request(
      `/api/projects/${projectId}/tickets`,
      { method: "POST", body: JSON.stringify({ title: "Stable", type: "task" }) },
      cookie,
    );
    const ticketId = (created.json.ticket as Json).id as string;
    const ticket = created.json.ticket as Json;

    const noop = await request(
      `/api/tickets/${ticketId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: ticket.title, version: ticket.version }),
      },
      cookie,
    );
    expect(noop.status).toBe(200);

    const after = await request("/api/agent/events?limit=500", {}, cookie);
    const forTicket = (after.json.events as Json[]).filter((e) => e.ticket_id === ticketId);
    expect(forTicket.map((e) => e.event_type)).toEqual(["ticket_created"]);
  });
});

describe("platform admin", () => {
  it("forbids space create for non-admin and lists users for admin", async () => {
    const member = await register("Normie");
    const forbidden = await request(
      "/api/clients",
      { method: "POST", body: JSON.stringify({ name: "Nope" }) },
      member.cookie,
    );
    expect(forbidden.status).toBe(403);

    const deniedList = await request("/api/admin/users", {}, member.cookie);
    expect(deniedList.status).toBe(403);

    const admin = await register("Boss", { admin: true });
    const listed = await request("/api/admin/users", {}, admin.cookie);
    expect(listed.status).toBe(200);
    const users = listed.json.users as Json[];
    expect(users.some((u) => u.id === member.userId)).toBe(true);
    expect(users.some((u) => u.id === admin.userId && u.is_admin === true)).toBe(true);

    const created = await createClient(admin.cookie, "AdminSpace");
    expect(created).toBeTruthy();

    const invited = await request(
      `/api/clients/${created}/members`,
      {
        method: "POST",
        body: JSON.stringify({ email: member.email, role: "member" }),
      },
      admin.cookie,
    );
    expect(invited.status).toBe(201);
    expect((invited.json.member as Json).user_id).toBe(member.userId);
  });

  it("seeds admin from ADMIN_EMAIL when none exist and refuses demoting the last admin", async () => {
    const { ensureSeedAdmin } = await import("../src/lib/seed-admin");
    await env.DB.prepare(`UPDATE users SET is_admin = 0`).run();
    await ensureSeedAdmin({
      ...env,
      ADMIN_EMAIL: "seed-admin@example.com",
      ADMIN_PASSWORD: "password123",
      ADMIN_NAME: "Seed Admin",
    });

    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "seed-admin@example.com", password: "password123" }),
    });
    expect(login.status).toBe(200);
    expect((login.json.user as Json).is_admin).toBe(true);
    const seedId = (login.json.user as Json).id as string;
    const cookie = cookieFrom(login.headers);

    const demote = await request(
      `/api/admin/users/${seedId}`,
      { method: "PATCH", body: JSON.stringify({ is_admin: false }) },
      cookie,
    );
    expect(demote.status).toBe(400);
    expect(demote.json.error).toBe("last_admin");
  });
});

describe("M10 project statuses", () => {
  it("allows owner to customize columns with migrate", async () => {
    const owner = await register("StatusOwner", { admin: true });
    const member = await register("StatusMember");
    const clientId = await createClient(owner.cookie, "StatusCo");
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
      { method: "POST", body: JSON.stringify({ name: "Board", client_id: clientId }) },
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

    const ticket = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({ title: "In review lane", type: "task", status: "review" }),
      },
      owner.cookie,
    );
    expect(ticket.status).toBe(201);

    const memberPut = await request(
      `/api/projects/${projectId}/statuses`,
      {
        method: "PUT",
        body: JSON.stringify({
          statuses: [
            { key: "backlog", label: "Backlog", category: "backlog" },
            { key: "done", label: "Done", category: "done" },
          ],
        }),
      },
      member.cookie,
    );
    expect(memberPut.status).toBe(403);

    const missingMigrate = await request(
      `/api/projects/${projectId}/statuses`,
      {
        method: "PUT",
        body: JSON.stringify({
          statuses: [
            { key: "backlog", label: "Backlog", category: "backlog" },
            { key: "done", label: "Done", category: "done" },
          ],
        }),
      },
      owner.cookie,
    );
    expect(missingMigrate.status).toBe(400);
    expect(missingMigrate.json.error).toBe("migrate_required");

    const put = await request(
      `/api/projects/${projectId}/statuses`,
      {
        method: "PUT",
        body: JSON.stringify({
          statuses: [
            { key: "backlog", label: "Ideas", category: "backlog", sort_order: 0 },
            { key: "building", label: "Building", category: "active", sort_order: 1 },
            { key: "done", label: "Shipped", category: "done", sort_order: 2 },
          ],
          migrate: { review: "building" },
        }),
      },
      owner.cookie,
    );
    expect(put.status).toBe(200);
    expect((put.json.statuses as Json[]).map((s) => s.key)).toEqual([
      "backlog",
      "building",
      "done",
    ]);
    expect((put.json.statuses as Json[])[0].label).toBe("Ideas");

    const kanban = await request(`/api/projects/${projectId}/kanban`, {}, owner.cookie);
    expect(kanban.status).toBe(200);
    const cols = kanban.json.columns as Record<string, Json[]>;
    expect(cols.building?.some((t) => t.title === "In review lane")).toBe(true);
    expect(cols.review).toBeUndefined();

    const badStatus = await request(
      `/api/projects/${projectId}/tickets`,
      {
        method: "POST",
        body: JSON.stringify({ title: "Nope", type: "task", status: "review" }),
      },
      owner.cookie,
    );
    expect(badStatus.status).toBe(400);
  });
});
