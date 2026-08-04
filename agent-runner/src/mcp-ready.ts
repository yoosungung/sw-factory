/** MCP readiness probe for agent-runner Pods. */

import { spawnSync } from "node:child_process";

export interface McpReadyResult {
  ok: boolean;
  reason: string;
}

/**
 * Smoke-check that leantime-mcp imports under the runner Python.
 * Skipped when AGENT_RUNNER_MOCK=1 or AGENT_RUNNER_SKIP_MCP_READY=1.
 */
export function probeMcpReady(
  env: NodeJS.ProcessEnv = process.env,
): McpReadyResult {
  if (env.AGENT_RUNNER_MOCK === "1" || env.AGENT_RUNNER_SKIP_MCP_READY === "1") {
    return { ok: true, reason: "skipped" };
  }

  const python = env.AGENT_RUNNER_PYTHON ?? "python3";
  const result = spawnSync(
    python,
    ["-c", "import mcp, fastmcp; import leantime_mcp"],
    {
      encoding: "utf8",
      timeout: 10_000,
      env,
    },
  );
  if (result.status === 0) {
    return { ok: true, reason: "ok" };
  }
  const detail = (result.stderr || result.stdout || result.error?.message || "mcp_probe_failed")
    .toString()
    .trim()
    .slice(0, 300);
  return { ok: false, reason: detail || "mcp_probe_failed" };
}
