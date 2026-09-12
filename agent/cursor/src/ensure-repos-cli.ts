#!/usr/bin/env node
/**
 * Deterministic ensureRepos from agents.yaml (no factory login).
 * Used by Docker/k8s entrypoint and local ops.
 *
 *   npx tsx agent/cursor/src/ensure-repos-cli.ts \
 *     --config /config/agents.yaml --data-dir /data
 *
 * Auth: GH_TOKEN or GITHUB_TOKEN (private HTTPS clones).
 */
import path from "node:path";
import { loadAgentsYaml } from "../../shared/load-config";
import {
  ensurePersonaRepos,
  resolveGhToken,
  writeClientsReposRegistry,
} from "./ensure-repos";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    "Usage: tsx agent/cursor/src/ensure-repos-cli.ts --config <agents.yaml> --data-dir <dir>",
  );
  process.exit(1);
}

async function main() {
  const configPath = arg("--config") ?? process.env.AGENTS_YAML;
  const dataDir = arg("--data-dir") ?? process.env.DATA_DIR;
  if (!configPath || !dataDir) usage();

  const file = await loadAgentsYaml(configPath);
  const token = resolveGhToken();
  const sessions = file.agents.filter((a) => a.type === "sessions");

  for (const a of sessions) {
    const results = await ensurePersonaRepos({
      dataDir,
      persona: a.persona,
      agent: a,
      repos: file.repos ?? [],
      token,
    });
    const reg = await writeClientsReposRegistry({
      dataDir,
      persona: a.persona,
      entries: results,
    });
    console.log(
      JSON.stringify({
        msg: "ensure_repos",
        persona: a.persona,
        registry: reg,
        repos: results.map((r) => ({
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
