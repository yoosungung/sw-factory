import type { SdkBackend } from "./types";
import { createMockBackend } from "./mock-backend";

type DisposableAgent = {
  agentId: string;
  send: (prompt: string) => Promise<{ runId: string }>;
  close: () => Promise<void>;
};

/**
 * Real `@cursor/sdk` backend when CURSOR_API_KEY is set and package is installed.
 * Falls back to mock otherwise (local harness / tests).
 */
export async function createSdkBackend(opts: {
  model?: string;
  forceMock?: boolean;
}): Promise<SdkBackend & { mode: "sdk" | "mock" }> {
  if (opts.forceMock || !process.env.CURSOR_API_KEY) {
    const mock = createMockBackend();
    return Object.assign(mock, { mode: "mock" as const });
  }

  let AgentMod: { Agent: { create: (opts: Record<string, unknown>) => Promise<Record<string, unknown>> } };
  try {
    AgentMod = (await import(
      /* webpackIgnore: true */ "@cursor/sdk"
    )) as typeof AgentMod;
  } catch {
    const mock = createMockBackend();
    return Object.assign(mock, { mode: "mock" as const });
  }

  const live = new Map<string, DisposableAgent>();
  const modelId = opts.model ?? "composer-2.5";
  const { Agent } = AgentMod;

  const backend: SdkBackend & { mode: "sdk" | "mock" } = {
    mode: "sdk",
    async create({ cwd }) {
      const agent = await Agent.create({
        apiKey: process.env.CURSOR_API_KEY!,
        model: { id: modelId },
        local: { cwd, settingSources: ["project"] },
      });
      const agentId =
        typeof agent.agentId === "string" ? agent.agentId : crypto.randomUUID();
      const handle: DisposableAgent = {
        agentId,
        async send(text: string) {
          const send = agent.send as (t: string) => Promise<{
            wait: () => Promise<unknown>;
            id?: string;
          }>;
          const run = await send(text);
          await run.wait();
          return { runId: run.id ?? crypto.randomUUID() };
        },
        async close() {
          const dispose = agent[Symbol.asyncDispose] as (() => Promise<void>) | undefined;
          await dispose?.();
        },
      };
      live.set(agentId, handle);
      return { agentId };
    },
    async send({ agentId, prompt }) {
      const handle = live.get(agentId);
      if (!handle) throw new Error(`unknown_agent:${agentId}`);
      return handle.send(prompt);
    },
    async cancel(agentId) {
      await live.get(agentId)?.close();
      live.delete(agentId);
    },
    async close(agentId) {
      await live.get(agentId)?.close();
      live.delete(agentId);
    },
  };

  return backend;
}
