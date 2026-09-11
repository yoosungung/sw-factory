import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loginFactory } from "./client";

export type PersonaSeed = {
  name: string;
  email: string;
  password: string;
  persona: string;
};

/**
 * Login as persona user and write session cookie + mcp.json under workspace.
 */
export async function seedPersonaWorkspace(opts: {
  dataDir: string;
  factoryBaseUrl: string;
  persona: PersonaSeed;
  fetchImpl?: typeof fetch;
}): Promise<{ cwd: string; cookie: string }> {
  const cwd = path.join(opts.dataDir, "workspaces", opts.persona.persona);
  await mkdir(path.join(cwd, "secrets"), { recursive: true });
  await mkdir(path.join(cwd, ".cursor"), { recursive: true });

  const cookie = await loginFactory({
    baseUrl: opts.factoryBaseUrl,
    email: opts.persona.email,
    password: opts.persona.password,
    fetchImpl: opts.fetchImpl,
  });

  await writeFile(path.join(cwd, "secrets", "session.cookie"), cookie, "utf8");
  await writeFile(
    path.join(cwd, ".cursor", "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          factory: {
            command: "node",
            args: ["agent/cursor/mcp/stdio.js"],
            env: {
              FACTORY_BASE_URL: opts.factoryBaseUrl,
              FACTORY_SESSION_COOKIE_FILE: path.join(cwd, "secrets", "session.cookie"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return { cwd, cookie };
}
