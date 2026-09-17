import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPersonaBundle,
  applyPreparedPersonaSeed,
  buildPersonaBundle,
  mergeMemory,
  preparePersonaSeeds,
} from "../src/persona-bundle";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const personasRoot = path.join(repoRoot, "deploy/personas");

describe("persona-bundle", () => {
  it("mergeMemory appends overlay after base", () => {
    const merged = mergeMemory("# Defaults\n\n- a\n", "# Persona: pm\n\n- b\n");
    expect(merged.startsWith("# Defaults")).toBe(true);
    expect(merged).toContain("# Persona: pm");
    expect(merged).toContain("\n\n# Persona");
  });

  it("mergeMemory returns base when overlay empty", () => {
    expect(mergeMemory("# Defaults only\n", null)).toBe("# Defaults only\n");
  });

  it("buildPersonaBundle(pm) merges MEMORY and includes factory-collab skill", async () => {
    const bundle = await buildPersonaBundle("pm", personasRoot);
    const memory = bundle["MEMORY.md"];
    expect(memory).toBeTruthy();
    expect(memory!).toContain("factory-collab");
    expect(memory!).toContain("org-knowledge");
    expect(memory!).toContain("persona: pm");
    expect(bundle[".cursor/skills/factory-collab/SKILL.md"]).toContain(
      "get_ticket",
    );
    expect(bundle[".cursor/skills/org-knowledge/SKILL.md"]).toContain(
      "ORG_WIKI_URL",
    );
    expect(bundle[".cursor/skills/factory-pm/SKILL.md"]).toContain("PM");
    expect(bundle[".cursor/roadmap-registry.json"]).toContain("repo_id");
    expect(bundle[".cursor/clients-repos-registry.json"]).toContain("nl2sql");
    expect(Object.keys(bundle).some((k) => k.endsWith(".sample"))).toBe(false);
    expect(bundle[".cursor/mcp.json"]).toBeUndefined();
  });

  it("buildPersonaBundle(ta) includes tenant-cd registry", async () => {
    const bundle = await buildPersonaBundle("ta", personasRoot);
    expect(bundle[".cursor/tenant-cd-registry.json"]).toContain("workflow");
    expect(bundle[".cursor/clients-repos-registry.json"]).toContain("nl2sql");
  });

  it("buildPersonaBundle(km) includes promote and researcher", async () => {
    const bundle = await buildPersonaBundle("km", personasRoot);
    expect(bundle["MEMORY.md"]).toContain("org-wiki");
    expect(bundle[".cursor/skills/knowledge-promote/SKILL.md"]).toContain(
      "wiki/",
    );
    expect(bundle[".cursor/skills/km-researcher/SKILL.md"]).toContain(
      "Inbox drain",
    );
  });

  it("applyPersonaBundle seed-once MEMORY and overwrites skills", async () => {
    const tmpRoot = path.join(repoRoot, "agent/.tmp-test");
    await mkdir(tmpRoot, { recursive: true });
    const dataDir = await mkdtemp(path.join(tmpRoot, "persona-"));
    const cwd = path.join(dataDir, "workspaces", "pm");
    await mkdir(cwd, { recursive: true });

    const first = await applyPersonaBundle({
      dataDir,
      persona: "pm",
      personasRoot,
    });
    expect(first.memoryWritten).toBe(true);
    const memPath = path.join(cwd, "MEMORY.md");
    await access(memPath);
    await writeFile(memPath, "# edited by runtime\n", "utf8");

    const skillPath = path.join(
      cwd,
      ".cursor/skills/factory-collab/SKILL.md",
    );
    await writeFile(skillPath, "# stale\n", "utf8");

    const second = await applyPersonaBundle({
      dataDir,
      persona: "pm",
      personasRoot,
    });
    expect(second.memoryWritten).toBe(false);
    expect(await readFile(memPath, "utf8")).toBe("# edited by runtime\n");
    expect(await readFile(skillPath, "utf8")).toContain("get_ticket");
  });

  it("preparePersonaSeeds writes merged trees without .sample", async () => {
    const tmpRoot = path.join(repoRoot, "agent/.tmp-test");
    await mkdir(tmpRoot, { recursive: true });
    const outDir = await mkdtemp(path.join(tmpRoot, "seed-"));

    const prepared = await preparePersonaSeeds({
      personasRoot,
      outDir,
      personas: ["pm", "km"],
    });
    expect(prepared).toEqual(["km", "pm"]);

    const pmMem = await readFile(path.join(outDir, "pm", "MEMORY.md"), "utf8");
    expect(pmMem).toContain("persona: pm");
    expect(pmMem).toContain("factory-collab");
    await access(
      path.join(outDir, "pm", ".cursor", "skills", "factory-collab", "SKILL.md"),
    );
    await access(
      path.join(outDir, "km", ".cursor", "skills", "km-researcher", "SKILL.md"),
    );
    await expect(
      access(path.join(outDir, "pm", "MEMORY.md.sample")),
    ).rejects.toBeTruthy();
    await expect(access(path.join(outDir, "_default"))).rejects.toBeTruthy();
  });

  it("applyPreparedPersonaSeed seed-once MEMORY and overwrites skills", async () => {
    const tmpRoot = path.join(repoRoot, "agent/.tmp-test");
    await mkdir(tmpRoot, { recursive: true });
    const outDir = await mkdtemp(path.join(tmpRoot, "seed-"));
    const dataDir = await mkdtemp(path.join(tmpRoot, "data-"));
    await preparePersonaSeeds({
      personasRoot,
      outDir,
      personas: ["pm"],
    });

    const first = await applyPreparedPersonaSeed({
      dataDir,
      persona: "pm",
      seedRoot: outDir,
    });
    expect(first.memoryWritten).toBe(true);
    const memPath = path.join(dataDir, "workspaces", "pm", "MEMORY.md");
    await writeFile(memPath, "# edited\n", "utf8");
    const skillPath = path.join(
      dataDir,
      "workspaces",
      "pm",
      ".cursor",
      "skills",
      "factory-collab",
      "SKILL.md",
    );
    await writeFile(skillPath, "# stale\n", "utf8");

    const second = await applyPreparedPersonaSeed({
      dataDir,
      persona: "pm",
      seedRoot: outDir,
    });
    expect(second.memoryWritten).toBe(false);
    expect(await readFile(memPath, "utf8")).toBe("# edited\n");
    expect(await readFile(skillPath, "utf8")).toContain("get_ticket");
  });
});
