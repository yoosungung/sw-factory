import type { AgentEvent } from "./types";

export async function pullEvents(opts: {
  factoryBaseUrl: string;
  sessionCookie: string;
  afterId: string | null;
  limit: number;
  fetchImpl?: typeof fetch;
}): Promise<AgentEvent[]> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const base = opts.factoryBaseUrl.replace(/\/$/, "");
  const qs = new URLSearchParams();
  if (opts.afterId) qs.set("after_id", opts.afterId);
  qs.set("limit", String(opts.limit));
  const res = await fetchFn(`${base}/api/agent/events?${qs}`, {
    headers: { Cookie: opts.sessionCookie },
  });
  if (!res.ok) {
    throw new Error(`tail failed: ${res.status}`);
  }
  const json = (await res.json()) as { events: AgentEvent[] };
  return json.events ?? [];
}
