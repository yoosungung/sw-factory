import type { AgentEvent } from "./types";

export type PullRetry = {
  attempts?: number;
  backoffMs?: number;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pullEvents(opts: {
  factoryBaseUrl: string;
  sessionCookie: string;
  afterId: string | null;
  limit: number;
  fetchImpl?: typeof fetch;
  retry?: PullRetry;
}): Promise<AgentEvent[]> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const base = opts.factoryBaseUrl.replace(/\/$/, "");
  const qs = new URLSearchParams();
  if (opts.afterId) qs.set("after_id", opts.afterId);
  qs.set("limit", String(opts.limit));
  const url = `${base}/api/agent/events?${qs}`;
  const attempts = opts.retry?.attempts ?? DEFAULT_ATTEMPTS;
  const backoffMs = opts.retry?.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastErr: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetchFn(url, {
        headers: { Cookie: opts.sessionCookie },
      });
      if (!res.ok) {
        throw new Error(`tail failed: ${res.status}`);
      }
      const json = (await res.json()) as { events: AgentEvent[] };
      return json.events ?? [];
    } catch (err) {
      lastErr = err;
      // HTTP status errors are not transient network blips — do not retry.
      if (err instanceof Error && err.message.startsWith("tail failed:")) {
        throw err;
      }
      if (i < attempts) await sleep(backoffMs * i);
    }
  }
  throw lastErr;
}
