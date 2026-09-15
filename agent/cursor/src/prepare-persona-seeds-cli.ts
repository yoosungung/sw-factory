#!/usr/bin/env node
/**
 * Build-time: merge deploy/personas overlays into prepared seed trees.
 *   npx tsx agent/cursor/src/prepare-persona-seeds-cli.ts \
 *     --personas-root deploy/personas --out /out/persona-seed
 */
import { preparePersonaSeeds } from "./persona-bundle";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    "Usage: tsx agent/cursor/src/prepare-persona-seeds-cli.ts --personas-root <dir> --out <dir>",
  );
  process.exit(1);
}

async function main() {
  const personasRoot = arg("--personas-root");
  const outDir = arg("--out");
  if (!personasRoot || !outDir) usage();

  const personas = await preparePersonaSeeds({ personasRoot, outDir });
  console.log(JSON.stringify({ msg: "persona_seeds_prepared", outDir, personas }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
