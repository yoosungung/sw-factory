import type { AgentEvent } from "./types";

export type DispatchResult =
  | { ok: true; agent_id: string; status: number }
  | {
      ok: false;
      status: number;
      reason?: string;
      rebind?: boolean;
      enqueue?: boolean;
      ackPoison?: boolean;
    };

export async function dispatchToCursor(opts: {
  cursorBaseUrl: string;
  stickyAgentId: string | null;
  persona: string;
  prompt: string;
  event: AgentEvent;
  fetchImpl?: typeof fetch;
}): Promise<DispatchResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const base = opts.cursorBaseUrl.replace(/\/$/, "");
  const body = {
    prompt: opts.prompt,
    ticket_id: opts.event.ticket_id,
    persona: opts.persona,
    event: opts.event,
  };

  const url = opts.stickyAgentId
    ? `${base}/sessions/${opts.stickyAgentId}/prompt`
    : `${base}/sessions`;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, enqueue: true };
  }

  if (res.status === 200 || res.status === 202) {
    const json = (await res.json().catch(() => ({}))) as { agent_id?: string };
    const agent_id = json.agent_id ?? opts.stickyAgentId ?? "";
    return { ok: true, agent_id, status: res.status };
  }

  const json = (await res.json().catch(() => ({}))) as {
    reason?: string;
    status?: string;
  };
  const reason = json.reason ?? json.status;

  if (res.status === 409 && reason === "sdk_zombie") {
    return { ok: false, status: 409, reason, rebind: true, enqueue: true };
  }
  if (res.status === 429) {
    return { ok: false, status: 429, reason, ackPoison: true };
  }
  if (res.status >= 500 || res.status === 0) {
    return { ok: false, status: res.status, enqueue: true };
  }
  // busy / mutex / other 409 → retry, keep sticky
  return { ok: false, status: res.status, reason, enqueue: true };
}
