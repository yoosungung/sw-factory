#!/usr/bin/env node
/**
 * Runtime: apply /opt/persona-seed/{persona} → /data/workspaces/{persona}
 * (MEMORY seed-once, skills overwrite), then refresh factory mcp.json paths.
 *   npx tsx agent/cursor/src/apply-persona-seeds-cli.ts \
 *     --seed-dir /opt/persona-seed --data-dir /data
 */
import { applyAllPreparedPersonaSeeds } from "./persona-bundle";
import { refreshFactoryMcpConfigs } from "../mcp/seed";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    "Usage: tsx agent/cursor/src/apply-persona-seeds-cli.ts --seed-dir <dir> --data-dir <dir>",
  );
  process.exit(1);
}

async function main() {
  const seedRoot =
    arg("--seed-dir") ?? process.env.PERSONA_SEED_DIR ?? "/opt/persona-seed";
  const dataDir = arg("--data-dir") ?? process.env.DATA_DIR;
  if (!dataDir) usage();

  const results = await applyAllPreparedPersonaSeeds({ dataDir, seedRoot });
  const factoryBaseUrl =
    arg("--factory-url") ??
    process.env.FACTORY_BASE_URL ??
    "https://factory.askwho.net";
  const mcpRefreshed = await refreshFactoryMcpConfigs({
    dataDir,
    factoryBaseUrl,
  });
  console.log(
    JSON.stringify({
      msg: "persona_seeds_applied",
      seedRoot,
      dataDir,
      personas: results.map((r) => ({
        persona: r.persona,
        memoryWritten: r.memoryWritten,
        filesWritten: r.filesWritten,
      })),
      mcpRefreshed,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
