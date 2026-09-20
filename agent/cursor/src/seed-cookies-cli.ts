#!/usr/bin/env node
/**
 * Login each type:sessions persona and write secrets/session.cookie + factory mcp.json.
 * Does not use GATEWAY_SESSION_COOKIE (that cookie is gateway poll only).
 *   npx tsx agent/cursor/src/seed-cookies-cli.ts \
 *     --config /config/agents.yaml --data-dir /data
 *
 * Password: PERSONA_PASSWORD_<NAME> or PERSONA_PASSWORD (shared).
 */
import { loadAgentsYaml } from "../../shared/load-config";
import { ensurePersonaSessionCookies } from "../mcp/seed";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    "Usage: tsx agent/cursor/src/seed-cookies-cli.ts --config <agents.yaml> --data-dir <dir> [--factory-url URL]",
  );
  process.exit(1);
}

async function main() {
  const configPath = arg("--config") ?? process.env.AGENTS_YAML;
  const dataDir = arg("--data-dir") ?? process.env.DATA_DIR;
  if (!configPath || !dataDir) usage();

  const file = await loadAgentsYaml(configPath);
  const factoryBaseUrl =
    arg("--factory-url") ??
    process.env.FACTORY_BASE_URL ??
    file.factory_base_url;

  const seeded = await ensurePersonaSessionCookies({
    dataDir,
    factoryBaseUrl,
    agents: file.agents,
  });
  console.log(
    JSON.stringify({
      msg: "persona_cookies_seeded",
      personas: seeded.map((s) => s.persona),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
