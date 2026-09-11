import { newId } from "./id";
import type { SdkBackend } from "./types";

/** In-memory mock SDK + optional MCP call recorder for tests. */
export function createMockBackend(opts?: {
  sendDelayMs?: number;
  onSend?: (info: { agentId: string; prompt: string; cwd: string }) => void | Promise<void>;
  failAgentIds?: Set<string>;
}): SdkBackend & { prompts: Array<{ agentId: string; prompt: string; cwd: string }> } {
  const prompts: Array<{ agentId: string; prompt: string; cwd: string }> = [];
  const delay = opts?.sendDelayMs ?? 20;

  return {
    prompts,
    async create({ persona }) {
      return { agentId: `mock-${persona}-${newId().slice(0, 8)}` };
    },
    async send({ agentId, prompt, cwd }) {
      if (opts?.failAgentIds?.has(agentId)) {
        throw new Error("mock_send_fail");
      }
      prompts.push({ agentId, prompt, cwd });
      await opts?.onSend?.({ agentId, prompt, cwd });
      await new Promise((r) => setTimeout(r, delay));
      return { runId: `run-${newId().slice(0, 8)}` };
    },
    async cancel() {},
    async close() {},
  };
}
