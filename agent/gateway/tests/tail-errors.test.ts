import { describe, expect, it, vi } from "vitest";
import { formatTickError } from "../src/errors";
import { pullEvents } from "../src/tail";

describe("formatTickError", () => {
  it("includes undici cause code and message", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
      code: "ECONNREFUSED",
      address: "127.0.0.1",
      port: 443,
    });
    const err = new TypeError("fetch failed", { cause });
    const formatted = formatTickError(err);
    expect(formatted).toContain("TypeError: fetch failed");
    expect(formatted).toContain("ECONNREFUSED");
    expect(formatted).toContain("127.0.0.1");
  });
});

describe("pullEvents retry", () => {
  it("retries transient fetch failures then returns events", async () => {
    const events = [
      {
        id: "e1",
        at: "2026-01-01T00:00:00.000Z",
        event_type: "ticket_created",
        ticket_id: "t1",
        project_id: "p1",
        actor_user_id: "u1",
        assignee_user_id: null,
        payload: {},
      },
    ];
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
        });
      }
      return new Response(JSON.stringify({ events }), { status: 200 });
    }) as unknown as typeof fetch;

    const got = await pullEvents({
      factoryBaseUrl: "http://127.0.0.1:9",
      sessionCookie: "lt_session=x",
      afterId: null,
      limit: 10,
      fetchImpl,
      retry: { attempts: 3, backoffMs: 0 },
    });
    expect(got).toHaveLength(1);
    expect(got[0]?.id).toBe("e1");
    expect(calls).toBe(3);
  });

  it("rethrows after exhausting retries", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }),
      });
    }) as unknown as typeof fetch;

    await expect(
      pullEvents({
        factoryBaseUrl: "http://127.0.0.1:9",
        sessionCookie: "lt_session=x",
        afterId: null,
        limit: 10,
        fetchImpl,
        retry: { attempts: 2, backoffMs: 0 },
      }),
    ).rejects.toThrow(/fetch failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
