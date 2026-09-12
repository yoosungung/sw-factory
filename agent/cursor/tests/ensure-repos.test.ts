import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadAgentsYaml,
  resolveAgentRepoIds,
} from "../../shared/load-config";
import {
  ensurePersonaRepos,
  ensureRepo,
  injectTokenIntoHttpsUrl,
  writeClientsReposRegistry,
  type GitRunner,
} from "../src/ensure-repos";

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function tmp(): Promise<string> {
  const root = path.join(process.cwd(), ".tmp-test");
  await mkdir(root, { recursive: true });
  const d = await mkdtemp(path.join(root, "ensure-"));
  tempDirs.push(d);
  return d;
}

describe("resolveAgentRepoIds", () => {
  it("uniques primary_repo and repo_ids", () => {
    expect(
      resolveAgentRepoIds({
        name: "aa",
        user_id: "u",
        email: "a@x",
        persona: "aa",
        type: "sessions",
        primary_repo: "sw-factory",
        repo_ids: ["sw-factory", "nl2sql"],
      }),
    ).toEqual(["sw-factory", "nl2sql"]);
  });

  it("returns empty when unbound", () => {
    expect(
      resolveAgentRepoIds({
        name: "pm",
        user_id: "u",
        email: "p@x",
        persona: "pm",
        type: "sessions",
      }),
    ).toEqual([]);
  });
});

describe("loadAgentsYaml repos", () => {
  it("loads repos catalog and rejects unknown agent refs", async () => {
    const dir = await tmp();
    const ok = path.join(dir, "ok.yaml");
    await writeFile(
      ok,
      `
factory_base_url: https://example.com
prompts:
  ticket_created: a
  ticket_updated: a
  comment_added: a
  assignee_changed: a
  mention: a
  handoff: a
  catch_up: a
repos:
  - id: sw-factory
    git_repo_url: https://github.com/yoosungung/sw-factory.git
agents:
  - name: ic
    user_id: "1"
    email: ic@x
    persona: ic
    type: sessions
    primary_repo: sw-factory
`,
      "utf8",
    );
    const file = await loadAgentsYaml(ok);
    expect(file.repos?.[0]?.id).toBe("sw-factory");
    expect(resolveAgentRepoIds(file.agents[0]!)).toEqual(["sw-factory"]);

    const bad = path.join(dir, "bad.yaml");
    await writeFile(
      bad,
      `
factory_base_url: https://example.com
prompts:
  ticket_created: a
  ticket_updated: a
  comment_added: a
  assignee_changed: a
  mention: a
  handoff: a
  catch_up: a
repos: []
agents:
  - name: ic
    user_id: "1"
    email: ic@x
    persona: ic
    type: sessions
    primary_repo: missing
`,
      "utf8",
    );
    await expect(loadAgentsYaml(bad)).rejects.toThrow(/unknown repo id/);
  });
});

describe("injectTokenIntoHttpsUrl", () => {
  it("injects x-access-token for https urls", () => {
    expect(
      injectTokenIntoHttpsUrl(
        "https://github.com/org/repo.git",
        "secret-token",
      ),
    ).toBe("https://x-access-token:secret-token@github.com/org/repo.git");
  });
});

describe("ensureRepo", () => {
  it("clones when .git missing and resets remote to clean url", async () => {
    const dir = await tmp();
    const dest = path.join(dir, "repos", "sw-factory");
    const calls: string[][] = [];
    const runGit: GitRunner = async (args, cwd) => {
      calls.push([...args]);
      if (args[0] === "clone") {
        await mkdir(path.join(dest, ".git"), { recursive: true });
      }
      return { stdout: "", stderr: "" };
    };

    const result = await ensureRepo({
      dest,
      gitRepoUrl: "https://github.com/yoosungung/sw-factory.git",
      token: "tok",
      runGit,
    });

    expect(result.action).toBe("clone");
    expect(calls[0]?.[0]).toBe("clone");
    expect(calls[0]?.[1]).toContain("x-access-token:tok@");
    expect(calls.some((c) => c[0] === "remote" && c.includes("set-url"))).toBe(
      true,
    );
    const setUrl = calls.find((c) => c[0] === "remote" && c[1] === "set-url");
    expect(setUrl?.[3]).toBe("https://github.com/yoosungung/sw-factory.git");
  });

  it("fetches when .git exists (no clone)", async () => {
    const dir = await tmp();
    const dest = path.join(dir, "repos", "sw-factory");
    await mkdir(path.join(dest, ".git"), { recursive: true });
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push([...args]);
      if (args[0] === "rev-parse") return { stdout: "main\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };

    const result = await ensureRepo({
      dest,
      gitRepoUrl: "https://github.com/yoosungung/sw-factory.git",
      token: "tok",
      runGit,
    });

    expect(result.action).toBe("fetch");
    expect(calls.some((c) => c[0] === "clone")).toBe(false);
    expect(calls.some((c) => c[0] === "fetch")).toBe(true);
  });
});

describe("ensurePersonaRepos + registry", () => {
  it("ensures listed repos and writes clients-repos-registry.json", async () => {
    const dataDir = await tmp();
    const calls: string[][] = [];
    const runGit: GitRunner = async (args, cwd) => {
      calls.push([...args]);
      if (args[0] === "clone") {
        const dest = args[args.length - 1]!;
        await mkdir(path.join(dest, ".git"), { recursive: true });
      }
      if (args[0] === "rev-parse") return { stdout: "main\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };

    const results = await ensurePersonaRepos({
      dataDir,
      persona: "aa",
      agent: {
        name: "aa",
        user_id: "u",
        email: "aa@x",
        persona: "aa",
        type: "sessions",
        repo_ids: ["sw-factory", "nl2sql"],
      },
      repos: [
        {
          id: "sw-factory",
          git_repo_url: "https://github.com/yoosungung/sw-factory.git",
        },
        {
          id: "nl2sql",
          git_repo_url: "https://github.com/yoosungung/nl2sql.git",
        },
      ],
      token: "tok",
      runGit,
    });

    expect(results.map((r) => r.repoId)).toEqual(["sw-factory", "nl2sql"]);
    expect(calls.filter((c) => c[0] === "clone")).toHaveLength(2);

    const regPath = await writeClientsReposRegistry({
      dataDir,
      persona: "aa",
      entries: results,
    });
    const reg = JSON.parse(await readFile(regPath, "utf8")) as Array<{
      repo_id: string;
      path: string;
      git_repo_url: string;
    }>;
    expect(reg).toHaveLength(2);
    expect(reg[0]?.repo_id).toBe("sw-factory");
    expect(reg[0]?.path).toContain("/workspaces/aa/repos/sw-factory");
  });
});
