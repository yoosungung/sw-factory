import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatTicketNo,
  resolveProjectName,
  resolveTicketNo,
} from "./ticket-no";
import type { AgentEvent, PersonaConfig } from "./types";

export type HitlKind = "approval" | "mention";

export type HitlDetect = {
  kind: HitlKind;
  ticket_id: string;
};

export type HitlMailMessage = {
  to: string;
  subject: string;
  text: string;
};

/** Human-facing labels for ops mail (UUIDs kept off the primary lines). */
export type HitlLabels = {
  ticketLabel: string;
  ticketTitle?: string;
  ticketNo?: string;
  projectLabel: string;
  assigneeLabel: string;
  actorLabel: string;
};

export type HitlSendMail = (msg: HitlMailMessage) => Promise<void>;

export type HitlMailConfig = {
  to: string;
  /** Optional sender address for Cloudflare send_email (default: Worker HITL_MAIL_FROM or hitl@askwho.net). */
  from?: string;
  /** Default 30 minutes. */
  ttlMs?: number;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** Injected in tests; default uses Cloudflare Worker (/api/agent/hitl-mail) or Gmail API when OAuth env present. */
  sendMail?: HitlSendMail;
};

type SentStore = {
  entries: Record<string, { at: string }>;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function humanIds(agents: PersonaConfig[]): Set<string> {
  return new Set(agents.filter((a) => a.type === "human").map((a) => a.user_id));
}

function changedFields(payload: Record<string, unknown>): string[] {
  const raw = payload.changed_fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function mentionIds(payload: Record<string, unknown>): string[] {
  const raw = payload.mention_user_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export function detectHitlMail(
  event: AgentEvent,
  agents: PersonaConfig[],
): HitlDetect | null {
  if (!event.ticket_id) return null;
  const humans = humanIds(agents);
  if (humans.size === 0) return null;

  if (event.event_type === "ticket_updated") {
    const fields = changedFields(event.payload);
    if (!fields.includes("status")) return null;
    if (event.payload.status !== "waiting_for_approval") return null;
    if (!event.assignee_user_id || !humans.has(event.assignee_user_id)) {
      return null;
    }
    return { kind: "approval", ticket_id: event.ticket_id };
  }

  if (event.event_type === "comment_added") {
    const hits = mentionIds(event.payload).filter((id) => humans.has(id));
    if (hits.length === 0) return null;
    return { kind: "mention", ticket_id: event.ticket_id };
  }

  return null;
}

function sentPath(dataDir: string): string {
  return path.join(dataDir, "hitl-mail-sent.json");
}

async function loadSent(dataDir: string): Promise<SentStore> {
  try {
    const raw = await readFile(sentPath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as SentStore;
    if (!parsed || typeof parsed !== "object" || !parsed.entries) {
      return { entries: {} };
    }
    return { entries: parsed.entries };
  } catch {
    return { entries: {} };
  }
}

async function saveSent(dataDir: string, store: SentStore): Promise<void> {
  await writeFile(sentPath(dataDir), JSON.stringify(store, null, 2), "utf8");
}

function pruneExpired(store: SentStore, nowMs: number, ttlMs: number): void {
  for (const [key, row] of Object.entries(store.entries)) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || nowMs - at > ttlMs) {
      delete store.entries[key];
    }
  }
}

function personaLabel(
  userId: string | null | undefined,
  agents: PersonaConfig[],
): string {
  if (!userId) return "(none)";
  const hit = agents.find((a) => a.user_id === userId);
  if (hit) return hit.name;
  return `(unknown) ${userId.slice(0, 8)}`;
}

async function fetchTicketTitle(opts: {
  factoryBaseUrl: string;
  sessionCookie?: string;
  ticketId: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  const cookie = opts.sessionCookie?.trim();
  if (!cookie) return undefined;
  const fetchFn = opts.fetchImpl ?? fetch;
  const base = opts.factoryBaseUrl.replace(/\/$/, "");
  try {
    const res = await fetchFn(`${base}/api/tickets/${opts.ticketId}`, {
      headers: { Cookie: cookie },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { ticket?: { title?: string } };
    const title = json.ticket?.title?.trim();
    return title || undefined;
  } catch {
    return undefined;
  }
}

export async function resolveHitlLabels(opts: {
  event: AgentEvent;
  detect: HitlDetect;
  agents: PersonaConfig[];
  factoryBaseUrl: string;
  sessionCookie?: string;
  fetchImpl?: typeof fetch;
}): Promise<HitlLabels> {
  const { event, detect, agents } = opts;
  const sessionCookie = opts.sessionCookie ?? "";
  const projectName = await resolveProjectName({
    factoryBaseUrl: opts.factoryBaseUrl,
    sessionCookie,
    projectId: event.project_id,
    fetchImpl: opts.fetchImpl,
  });
  const ticketNo =
    (await resolveTicketNo({
      factoryBaseUrl: opts.factoryBaseUrl,
      sessionCookie,
      projectId: event.project_id,
      ticketId: detect.ticket_id,
      fetchImpl: opts.fetchImpl,
    })) ?? formatTicketNo(projectName, detect.ticket_id);

  const title = await fetchTicketTitle({
    factoryBaseUrl: opts.factoryBaseUrl,
    sessionCookie: opts.sessionCookie,
    ticketId: detect.ticket_id,
    fetchImpl: opts.fetchImpl,
  });

  return {
    ticketLabel: title ?? ticketNo,
    ticketTitle: title,
    ticketNo,
    projectLabel: projectName || event.project_id || "(none)",
    assigneeLabel: personaLabel(event.assignee_user_id, agents),
    actorLabel: personaLabel(event.actor_user_id, agents),
  };
}

export function composeMessage(
  event: AgentEvent,
  detect: HitlDetect,
  to: string,
  factoryBaseUrl: string,
  labels?: HitlLabels,
): HitlMailMessage {
  const base = factoryBaseUrl.replace(/\/$/, "");
  const projectUrl = event.project_id
    ? `${base}/projects/${event.project_id}?view=board`
    : base;
  const kindLabel =
    detect.kind === "approval" ? "waiting_for_approval" : "human @mention";
  const ticketLabel =
    labels?.ticketLabel ?? detect.ticket_id.slice(0, 8);
  const subject = `[factory HITL] ${kindLabel} · ${ticketLabel}`;

  let ticketLine = `ticket: ${ticketLabel}`;
  if (labels?.ticketTitle && labels.ticketNo) {
    ticketLine = `ticket: ${labels.ticketTitle} (${labels.ticketNo})`;
  } else if (labels?.ticketNo && !labels.ticketTitle) {
    ticketLine = `ticket: ${labels.ticketNo}`;
  }

  const text = [
    `HITL: ${kindLabel}`,
    ticketLine,
    `project: ${labels?.projectLabel ?? event.project_id ?? "(none)"}`,
    `assignee: ${labels?.assigneeLabel ?? event.assignee_user_id ?? "(none)"}`,
    `actor: ${labels?.actorLabel ?? event.actor_user_id}`,
    `event_type: ${event.event_type}`,
    `event_id: ${event.id}`,
    `Open: ${projectUrl}`,
    "",
    "SPA in-app notifications are out of scope; this is gateway ops mail only.",
  ].join("\n");
  return { to, subject, text };
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendViaGmailApi(
  msg: HitlMailMessage,
  oauth: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const tokenRes = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: oauth.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`gmail_token_http_${tokenRes.status}:${body.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("gmail_token_missing_access_token");
  }

  const mime = [
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    msg.text,
  ].join("\r\n");

  const sendRes = await fetchImpl(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenJson.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: toBase64Url(mime) }),
    },
  );
  if (!sendRes.ok) {
    const body = await sendRes.text();
    throw new Error(`gmail_send_http_${sendRes.status}:${body.slice(0, 200)}`);
  }
}

export async function sendViaCloudflareWorker(
  msg: HitlMailMessage & { from?: string },
  opts: { factoryBaseUrl: string; sessionCookie: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const base = opts.factoryBaseUrl.replace(/\/$/, "");
  const res = await fetchImpl(`${base}/api/agent/hitl-mail`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: opts.sessionCookie,
    },
    body: JSON.stringify({
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.from ? { from: msg.from } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`cf_mail_http_${res.status}:${body.slice(0, 200)}`);
  }
}

function resolveSendMail(
  mail: HitlMailConfig,
  workerOpts?: {
    factoryBaseUrl?: string;
    sessionCookie?: string;
    fetchImpl?: typeof fetch;
  },
): HitlSendMail | null {
  if (mail.sendMail) return mail.sendMail;
  const { clientId, clientSecret, refreshToken } = mail;
  if (clientId && clientSecret && refreshToken) {
    return (msg) =>
      sendViaGmailApi(
        msg,
        {
          clientId,
          clientSecret,
          refreshToken,
        },
        workerOpts?.fetchImpl,
      );
  }
  const factoryBaseUrl = workerOpts?.factoryBaseUrl?.trim();
  const sessionCookie = workerOpts?.sessionCookie?.trim();
  if (factoryBaseUrl && sessionCookie) {
    return (msg) =>
      sendViaCloudflareWorker(
        { ...msg, from: mail.from },
        { factoryBaseUrl, sessionCookie },
        workerOpts?.fetchImpl,
      );
  }
  return null;
}

export function hitlMailFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HitlMailConfig | undefined {
  const to = env.HITL_MAIL_TO?.trim();
  if (!to) return undefined;
  const ttlRaw = env.HITL_MAIL_TTL_MS?.trim();
  const ttlMs = ttlRaw ? Number(ttlRaw) : undefined;
  return {
    to,
    from: env.HITL_MAIL_FROM?.trim() || undefined,
    ttlMs: Number.isFinite(ttlMs) && (ttlMs as number) > 0 ? ttlMs : undefined,
    clientId: env.HITL_GMAIL_CLIENT_ID?.trim() || undefined,
    clientSecret: env.HITL_GMAIL_CLIENT_SECRET?.trim() || undefined,
    refreshToken: env.HITL_GMAIL_REFRESH_TOKEN?.trim() || undefined,
  };
}

export async function maybeSendHitlMail(opts: {
  event: AgentEvent;
  agents: PersonaConfig[];
  dataDir: string;
  factoryBaseUrl: string;
  sessionCookie?: string;
  mail: HitlMailConfig | undefined;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<void> {
  const { event, agents, dataDir, factoryBaseUrl, mail } = opts;
  if (!mail) return;

  const detect = detectHitlMail(event, agents);
  if (!detect) return;

  const send = resolveSendMail(mail, {
    factoryBaseUrl,
    sessionCookie: opts.sessionCookie,
    fetchImpl: opts.fetchImpl,
  });
  if (!send) return;

  const ttlMs = mail.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = opts.nowMs ?? Date.now();
  const key = `${detect.ticket_id}:${detect.kind}`;

  try {
    const store = await loadSent(dataDir);
    pruneExpired(store, nowMs, ttlMs);
    const prev = store.entries[key];
    if (prev) {
      const at = Date.parse(prev.at);
      if (Number.isFinite(at) && nowMs - at <= ttlMs) return;
    }

    const labels = await resolveHitlLabels({
      event,
      detect,
      agents,
      factoryBaseUrl,
      sessionCookie: opts.sessionCookie,
      fetchImpl: opts.fetchImpl,
    });
    const msg = composeMessage(event, detect, mail.to, factoryBaseUrl, labels);
    await send(msg);

    store.entries[key] = { at: new Date(nowMs).toISOString() };
    await saveSent(dataDir, store);
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "hitl_mail_error",
        ticket_id: detect.ticket_id,
        kind: detect.kind,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
