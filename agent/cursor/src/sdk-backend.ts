import type { SdkBackend } from "./types";
import { createMockBackend } from "./mock-backend";

type DisposableAgent = {
  agentId: string;
  send: (prompt: string) => Promise<{ runId: string }>;
  close: () => Promise<void>;
};

type SdkAgentLike = {
  agentId?: unknown;
  send: (text: string) => Promise<{ wait: () => Promise<unknown>; id?: string }>;
  [Symbol.asyncDispose]?: () => Promise<void>;
};

/**
 * Keep method-call receivers (`this`) intact.
 * Extracting `agent.send` / `agent[Symbol.asyncDispose]` and calling them unbound
 * crashes @cursor/sdk (`awaitPendingPrAttributions` on undefined).
 */
export function wrapSdkAgent(agent: SdkAgentLike): DisposableAgent {
  const agentId =
    typeof agent.agentId === "string" ? agent.agentId : crypto.randomUUID();
  return {
    agentId,
    async send(text: string) {
      const run = await agent.send(text);
      const result = (await run.wait()) as { status?: string; id?: string } | undefined;
      if (result && result.status === "error") {
        throw new Error(`sdk_run_error:${result.id ?? run.id ?? "unknown"}`);
      }
      return { runId: run.id ?? result?.id ?? crypto.randomUUID() };
    },
    async close() {
      try {
        await agent[Symbol.asyncDispose]?.();
      } catch (err) {
        console.error(
          JSON.stringify({
            msg: "sdk_dispose_failed",
            agentId,
            detail: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    },
  };
}

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

  let AgentMod: {
    Agent: {
      create: (opts: Record<string, unknown>) => Promise<SdkAgentLike>;
    };
  };
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
      const handle = wrapSdkAgent(agent);
      live.set(handle.agentId, handle);
      return { agentId: handle.agentId };
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
