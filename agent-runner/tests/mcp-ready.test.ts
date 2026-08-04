import { describe, expect, it } from "vitest";

import { probeMcpReady } from "../src/mcp-ready.js";

describe("probeMcpReady", () => {
  it("skips when AGENT_RUNNER_MOCK=1", () => {
    expect(probeMcpReady({ AGENT_RUNNER_MOCK: "1" })).toEqual({
      ok: true,
      reason: "skipped",
    });
  });

  it("skips when AGENT_RUNNER_SKIP_MCP_READY=1", () => {
    expect(probeMcpReady({ AGENT_RUNNER_SKIP_MCP_READY: "1" })).toEqual({
      ok: true,
      reason: "skipped",
    });
  });
});
