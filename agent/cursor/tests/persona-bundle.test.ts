import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPersonaBundle,
  buildPersonaBundle,
  mergeMemory,
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
    expect(Object.keys(bundle).some((k) => k.endsWith(".sample"))).toBe(false);
    expect(bundle[".cursor/mcp.json"]).toBeUndefined();
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
});
