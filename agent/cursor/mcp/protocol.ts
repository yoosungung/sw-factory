import type { createFactoryMcp, McpToolName } from "./tools";

type FactoryMcp = ReturnType<typeof createFactoryMcp>;

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    protocolVersion?: string;
  };
};

const EMPTY_OBJECT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: true,
} as const;

/** Cursor / MCP SDK JSON-RPC over newline-delimited stdio. */
export async function handleStdioRpc(
  mcp: FactoryMcp,
  msg: JsonRpcRequest,
): Promise<string | null> {
  const method = msg.method;
  const id = msg.id;
  const isNotification = id === undefined || id === null;

  if (method === "initialize") {
    return jsonRpc(id, {
      protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "factory", version: "1.0.0" },
    });
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }

  if (method === "ping") {
    if (isNotification) return null;
    return jsonRpc(id, {});
  }

  if (method === "tools/list") {
    if (isNotification) return null;
    return jsonRpc(id, {
      tools: mcp.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: EMPTY_OBJECT_SCHEMA,
      })),
    });
  }

  if (method === "tools/call") {
    if (isNotification) return null;
    try {
      const name = msg.params?.name as McpToolName;
      const result = await mcp.callTool(name, msg.params?.arguments ?? {});
      return jsonRpc(id, result);
    } catch (err) {
      return jsonRpcError(
        id,
        -32000,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (isNotification) return null;
  return jsonRpcError(id, -32601, `Method not found: ${method ?? ""}`);
}

function jsonRpc(id: string | number | null | undefined, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}
