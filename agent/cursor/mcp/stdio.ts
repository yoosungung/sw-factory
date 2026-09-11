/**
 * Minimal MCP-shaped stdio entry (tools/list + tools/call over newline JSON).
 * Production Cursor wires this via persona `.cursor/mcp.json`.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { FactoryClient } from "./client";
import { createFactoryMcp } from "./tools";

const baseUrl = process.env.FACTORY_BASE_URL;
const cookieFile = process.env.FACTORY_SESSION_COOKIE_FILE;
if (!baseUrl || !cookieFile) {
  console.error("FACTORY_BASE_URL and FACTORY_SESSION_COOKIE_FILE required");
  process.exit(1);
}

const cookie = readFileSync(cookieFile, "utf8").trim();
const mcp = createFactoryMcp(new FactoryClient({ baseUrl, cookie }));

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  try {
    const msg = JSON.parse(line) as {
      id?: string | number;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    if (msg.method === "tools/list") {
      process.stdout.write(
        JSON.stringify({ id: msg.id, result: { tools: mcp.tools } }) + "\n",
      );
      return;
    }
    if (msg.method === "tools/call") {
      const name = msg.params?.name as Parameters<typeof mcp.callTool>[0];
      const result = await mcp.callTool(name, msg.params?.arguments ?? {});
      process.stdout.write(JSON.stringify({ id: msg.id, result }) + "\n");
      return;
    }
    process.stdout.write(
      JSON.stringify({ id: msg.id, error: { message: "unsupported_method" } }) + "\n",
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        error: { message: err instanceof Error ? err.message : String(err) },
      }) + "\n",
    );
  }
});
