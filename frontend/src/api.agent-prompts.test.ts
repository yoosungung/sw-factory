import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, client } from "./api";

describe("client.postAgentPrompt", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs body with optional ticket_id omitted when null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "evt-1", at: "2026-10-02T00:00:00.000Z" }),
    });

    const res = await client.postAgentPrompt({
      project_id: "p1",
      target: "sw-factory",
      prompt: "Wake up",
      ticket_id: null,
    });

    expect(res).toEqual({ id: "evt-1", at: "2026-10-02T00:00:00.000Z" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/agent/prompts");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      project_id: "p1",
      target: "sw-factory",
      prompt: "Wake up",
    });
  });

  it("includes ticket_id when provided", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "evt-2", at: "2026-10-02T00:00:01.000Z" }),
    });

    await client.postAgentPrompt({
      project_id: "p1",
      target: "pm",
      prompt: "Review",
      ticket_id: "t-1",
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.ticket_id).toBe("t-1");
  });

  it("throws ApiError on 4xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_target" }),
    });

    await expect(
      client.postAgentPrompt({
        project_id: "p1",
        target: "nobody",
        prompt: "x",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
