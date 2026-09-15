#!/usr/bin/env node
/**
 * Seed persona workspaces: login cookie + mcp.json + deploy/personas bundle
 * + ensureRepos from agents.yaml (clone-if-missing).
 * Usage:
 *   npx tsx agent/cursor/src/seed-cli.ts \
 *     --config deploy/local/agents.yaml \
 *     --data-dir deploy/local/.local-data \
 *     [--seed-dir /opt/persona-seed | --personas-root deploy/personas]
 *
 * Password: PERSONA_PASSWORD_<NAME> or PERSONA_PASSWORD (shared).
 * GitHub: GH_TOKEN or GITHUB_TOKEN (private repos).
 */
import path from "node:path";
import { loadAgentsYaml } from "../../shared/load-config";
import { seedPersonaWorkspace } from "../mcp/seed";
import { resolveGhToken } from "./ensure-repos";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    "Usage: tsx agent/cursor/src/seed-cli.ts --config <agents.yaml> --data-dir <dir> [--factory-url URL]",
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
  const personasRoot =
    arg("--personas-root") ??
    path.resolve(process.cwd(), "deploy/personas");
  const seedRoot = arg("--seed-dir") ?? process.env.PERSONA_SEED_DIR;
  const ghToken = resolveGhToken();

  const sessions = file.agents.filter((a) => a.type === "sessions");
  for (const a of sessions) {
    const password =
      process.env[`PERSONA_PASSWORD_${a.name.toUpperCase()}`] ??
      process.env.PERSONA_PASSWORD;
    if (!password) {
      console.error(
        `Set PERSONA_PASSWORD or PERSONA_PASSWORD_${a.name.toUpperCase()} for ${a.name}`,
      );
      process.exit(1);
    }
    const { cwd, reposEnsured } = await seedPersonaWorkspace({
      dataDir,
      factoryBaseUrl,
      personasRoot: seedRoot ? undefined : personasRoot,
      seedRoot,
      persona: {
        name: a.name,
        email: a.email,
        password,
        persona: a.persona,
      },
      agent: a,
      repos: file.repos ?? [],
      ghToken,
    });
    console.log(
      JSON.stringify({
        msg: "seeded",
        persona: a.persona,
        cwd,
        repos: reposEnsured.map((r) => ({
          id: r.repoId,
          action: r.action,
          path: r.path,
        })),
      }),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
