import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SPECIAL = new Set([
  "MEMORY.md",
  ".cursor/MEMORY.md",
  "mcp.json",
  ".cursor/mcp.json",
  "cli-config.json",
  ".cursor/cli-config.json",
]);

export function mergeMemory(base: string, overlay: string | null | undefined): string {
  if (!base.trim()) return (overlay || "").trim() + (overlay ? "\n" : "");
  if (!overlay || !overlay.trim()) return base.endsWith("\n") ? base : base + "\n";
  return base.replace(/\s*$/, "") + "\n\n" + overlay.replace(/^\s*/, "");
}

async function walkFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await walkFiles(abs)));
    else if (e.isFile()) result.push(abs);
  }
  return result;
}

/** Collect tree; MEMORY.md.sample → MEMORY.md content; skip other *.sample and mcp.json. */
export async function collectTree(directory: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const abs of await walkFiles(directory)) {
    const rel = path.relative(directory, abs).split(path.sep).join("/");
    if (rel === "mcp.json" || rel === ".cursor/mcp.json") continue;
    if (rel.endsWith(".sample")) {
      if (path.basename(rel) === "MEMORY.md.sample") {
        out["MEMORY.md"] = await readFile(abs, "utf8");
      }
      continue;
    }
    out[rel] = await readFile(abs, "utf8");
  }
  return out;
}

function memoryText(tree: Record<string, string>): string {
  return tree["MEMORY.md"] || tree[".cursor/MEMORY.md"] || "";
}

export function buildPersonaBundleFromTrees(
  defaultTree: Record<string, string>,
  personaTree: Record<string, string>,
): Record<string, string> {
  const baseFiles = Object.fromEntries(
    Object.entries(defaultTree).filter(([k]) => !SPECIAL.has(k)),
  );
  const overlayFiles = Object.fromEntries(
    Object.entries(personaTree).filter(([k]) => !SPECIAL.has(k)),
  );
  const bundle: Record<string, string> = { ...baseFiles, ...overlayFiles };

  const memory = mergeMemory(memoryText(defaultTree), memoryText(personaTree) || null);
  if (memory.trim()) {
    bundle["MEMORY.md"] = memory.endsWith("\n") ? memory : memory + "\n";
  }
  return bundle;
}

export async function buildPersonaBundle(
  persona: string,
  personasRoot: string,
): Promise<Record<string, string>> {
  const defaultTree = await collectTree(path.join(personasRoot, "_default"));
  const personaTree =
    persona === "_default"
      ? {}
      : await collectTree(path.join(personasRoot, persona));
  return buildPersonaBundleFromTrees(defaultTree, personaTree);
}

/** Persona overlay dirs under deploy/personas (excludes `_default`). */
export async function listPersonaIds(personasRoot: string): Promise<string[]> {
  const entries = await readdir(personasRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name !== "_default" && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

async function writeBundleTree(
  outDir: string,
  bundle: Record<string, string>,
): Promise<number> {
  let written = 0;
  for (const [rel, content] of Object.entries(bundle)) {
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
    written += 1;
  }
  return written;
}

/**
 * Merge `_default`⊕overlay into prepared seed trees: `{outDir}/{persona}/MEMORY.md` + skills.
 * Used by Docker image build (final image has no raw overlay source).
 */
export async function preparePersonaSeeds(opts: {
  personasRoot: string;
  outDir: string;
  personas?: string[];
}): Promise<string[]> {
  const personas =
    opts.personas?.slice().sort() ?? (await listPersonaIds(opts.personasRoot));
  await mkdir(opts.outDir, { recursive: true });
  for (const persona of personas) {
    const bundle = await buildPersonaBundle(persona, opts.personasRoot);
    const dest = path.join(opts.outDir, persona);
    await mkdir(dest, { recursive: true });
    await writeBundleTree(dest, bundle);
  }
  return personas;
}

async function applyBundleToWorkspace(opts: {
  cwd: string;
  bundle: Record<string, string>;
}): Promise<{ memoryWritten: boolean; filesWritten: number }> {
  await mkdir(opts.cwd, { recursive: true });
  let memoryWritten = false;
  let filesWritten = 0;

  for (const [rel, content] of Object.entries(opts.bundle)) {
    if (rel === "MEMORY.md" || rel === ".cursor/MEMORY.md") {
      const memDest = path.join(opts.cwd, "MEMORY.md");
      try {
        await stat(memDest);
      } catch {
        await mkdir(path.dirname(memDest), { recursive: true });
        await writeFile(memDest, content, "utf8");
        memoryWritten = true;
        filesWritten += 1;
      }
      continue;
    }
    const dest = path.join(opts.cwd, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
    filesWritten += 1;
  }

  return { memoryWritten, filesWritten };
}

export async function applyPersonaBundle(opts: {
  dataDir: string;
  persona: string;
  personasRoot: string;
}): Promise<{ cwd: string; memoryWritten: boolean; filesWritten: number }> {
  const bundle = await buildPersonaBundle(opts.persona, opts.personasRoot);
  const cwd = path.join(opts.dataDir, "workspaces", opts.persona);
  const result = await applyBundleToWorkspace({ cwd, bundle });
  return { cwd, ...result };
}

/** Apply a pre-merged seed tree from `{seedRoot}/{persona}/` (Docker `/opt/persona-seed`). */
export async function applyPreparedPersonaSeed(opts: {
  dataDir: string;
  persona: string;
  seedRoot: string;
}): Promise<{ cwd: string; memoryWritten: boolean; filesWritten: number }> {
  const seedDir = path.join(opts.seedRoot, opts.persona);
  const bundle = await collectTree(seedDir);
  const cwd = path.join(opts.dataDir, "workspaces", opts.persona);
  const result = await applyBundleToWorkspace({ cwd, bundle });
  return { cwd, ...result };
}

/** Apply every persona directory under seedRoot into dataDir/workspaces. */
export async function applyAllPreparedPersonaSeeds(opts: {
  dataDir: string;
  seedRoot: string;
}): Promise<
  Array<{ persona: string; cwd: string; memoryWritten: boolean; filesWritten: number }>
> {
  const personas = await listPersonaIds(opts.seedRoot);
  const out = [];
  for (const persona of personas) {
    const r = await applyPreparedPersonaSeed({
      dataDir: opts.dataDir,
      persona,
      seedRoot: opts.seedRoot,
    });
    out.push({ persona, ...r });
  }
  return out;
}
