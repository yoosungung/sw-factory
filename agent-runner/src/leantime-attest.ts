/** Leantime JSON-RPC attestation for success-check read-after-write. */

import type { WriteAttestation } from "./success-verify.js";

export interface LeantimeRpcEnv {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

function envConfig(overrides?: LeantimeRpcEnv): { base: string; token: string } | null {
  const base = (overrides?.url ?? process.env.LEANTIME_URL ?? "").replace(/\/$/, "");
  const token = overrides?.token ?? process.env.LEANTIME_ACCESS_TOKEN ?? "";
  if (!base || !token) {
    return null;
  }
  return { base, token };
}

async function rpcCall(
  method: string,
  params: Record<string, unknown>,
  cfg: { base: string; token: string },
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(`${cfg.base}/api/jsonrpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`Leantime RPC HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: unknown; error?: unknown };
  if (body.error !== undefined) {
    throw new Error(`Leantime RPC error: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

function commentDateMs(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Attester that treats a recent comment on the ticket as evidence a write landed.
 * Uses Comments.getComments (parent=-1) when credentials are present.
 */
export function createLeantimeWriteAttestation(
  overrides?: LeantimeRpcEnv,
): WriteAttestation | undefined {
  const cfg = envConfig(overrides);
  if (!cfg) {
    return undefined;
  }
  const fetchImpl = overrides?.fetchImpl ?? fetch;

  return {
    async recentWriteOnTicket(ticketId: number, withinMs: number): Promise<boolean> {
      const result = await rpcCall(
        "leantime.rpc.Comments.Comments.getComments",
        { module: "ticket", moduleId: ticketId, parent: -1 },
        cfg,
        fetchImpl,
      );
      if (!Array.isArray(result)) {
        return false;
      }
      const cutoff = Date.now() - withinMs;
      for (const row of result) {
        if (row === null || typeof row !== "object") {
          continue;
        }
        const dateMs = commentDateMs((row as { date?: unknown; rawDate?: unknown }).rawDate
          ?? (row as { date?: unknown }).date);
        if (dateMs !== null && dateMs >= cutoff) {
          return true;
        }
      }
      return false;
    },
  };
}
