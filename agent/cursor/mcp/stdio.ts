/**
 * MCP JSON-RPC stdio entry (initialize + tools/list + tools/call).
 * Cursor IDE and persona `.cursor/mcp.json` both wire this.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { FactoryClient } from "./client";
import { handleStdioRpc } from "./protocol";
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
    const msg = JSON.parse(line) as Parameters<typeof handleStdioRpc>[1];
    const out = await handleStdioRpc(mcp, msg);
    if (out != null) process.stdout.write(out + "\n");
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: err instanceof Error ? err.message : String(err),
        },
      }) + "\n",
    );
  }
});
