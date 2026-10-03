import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadAgentsYaml,
  resolveAgentRepoIds,
} from "../../shared/load-config";
import {
  DEFAULT_CD_PATH,
  DEFAULT_ROADMAP_PATH,
  ensurePersonaRepos,
  ensureRepo,
  injectTokenIntoHttpsUrl,
  writeClientsReposRegistry,
  writeDerivedRegistries,
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

  it("loads repo client/project ids and agent roadmaps/tenant_cd", async () => {
    const dir = await tmp();
    const p = path.join(dir, "ok.yaml");
    await writeFile(
      p,
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
    git_repo_url: https://github.com/example/sw-factory.git
    client_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    project_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  - id: nl2sql
    git_repo_url: https://github.com/example/nl2sql.git
agents:
  - name: pm
    user_id: "1"
    email: pm@x
    persona: pm
    type: sessions
    roadmaps:
      - repo_id: sw-factory
      - repo_id: sw-factory
        path: docs/ROADMAP.md
  - name: ta
    user_id: "2"
    email: ta@x
    persona: ta
    type: sessions
    tenant_cd:
      - repo_id: nl2sql
`,
      "utf8",
    );
    const file = await loadAgentsYaml(p);
    expect(file.repos?.[0]?.client_id).toBe(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(file.agents[0]?.roadmaps).toEqual([
      { repo_id: "sw-factory" },
      { repo_id: "sw-factory", path: "docs/ROADMAP.md" },
    ]);
    expect(file.agents[1]?.tenant_cd).toEqual([{ repo_id: "nl2sql" }]);
  });

  it("rejects unknown roadmaps/tenant_cd repo ids", async () => {
    const dir = await tmp();
    const p = path.join(dir, "bad.yaml");
    await writeFile(
      p,
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
    git_repo_url: https://github.com/example/sw-factory.git
agents:
  - name: pm
    user_id: "1"
    email: pm@x
    persona: pm
    type: sessions
    roadmaps:
      - repo_id: missing
`,
      "utf8",
    );
    await expect(loadAgentsYaml(p)).rejects.toThrow(/unknown repo id/);
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
    expect(
      calls.some(
        (c) => c[0] === "config" && c.includes("safe.directory") && c.includes(dest),
      ),
    ).toBe(true);
    const clone = calls.find((c) => c[0] === "clone");
    expect(clone?.[0]).toBe("clone");
    expect(clone?.[1]).toContain("x-access-token:tok@");
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

  it("writes roadmap and tenant_cd registries from yaml + verify overlay", async () => {
    const dataDir = await tmp();
    const repos = [
      {
        id: "sw-factory",
        git_repo_url: "https://github.com/yoosungung/sw-factory.git",
        client_id: "cc",
        project_id: "pp",
      },
      {
        id: "nl2sql",
        git_repo_url: "https://github.com/yoosungung/nl2sql.git",
        client_id: "c2",
      },
    ];

    const roadmapPath = await writeDerivedRegistries({
      dataDir,
      persona: "pm",
      agent: {
        name: "pm",
        user_id: "u",
        email: "pm@x",
        persona: "pm",
        type: "sessions",
        roadmaps: [{ repo_id: "sw-factory" }],
      },
      repos,
    });
    expect(roadmapPath.roadmap).toContain("roadmap-registry.json");
    const roadmap = JSON.parse(
      await readFile(roadmapPath.roadmap!, "utf8"),
    ) as { repos: Array<{ repo_id: string; path: string; git_repo_url: string }> };
    expect(roadmap.repos).toEqual([
      {
        repo_id: "sw-factory",
        git_repo_url: "https://github.com/yoosungung/sw-factory.git",
        path: DEFAULT_ROADMAP_PATH,
        project_id: "pp",
        client_id: "cc",
      },
    ]);

    const cd = await writeDerivedRegistries({
      dataDir,
      persona: "ta",
      agent: {
        name: "ta",
        user_id: "u",
        email: "ta@x",
        persona: "ta",
        type: "sessions",
        tenant_cd: [{ repo_id: "nl2sql" }],
      },
      repos,
      verifyByRepoId: {
        nl2sql: {
          namespace: "nl2sql",
          deployment: "nl2sql",
          timeout_sec: 300,
          smoke: {
            type: "http",
            url: "http://nl2sql.nl2sql.svc.cluster.local:8080/healthz",
            expect_status: 200,
          },
        },
      },
    });
    const tenant = JSON.parse(await readFile(cd.tenantCd!, "utf8")) as Array<{
      repo_id: string;
      cd_path: string;
      verify: { namespace: string };
    }>;
    expect(tenant).toHaveLength(1);
    expect(tenant[0]?.repo_id).toBe("nl2sql");
    expect(tenant[0]?.cd_path).toBe(DEFAULT_CD_PATH);
    expect(tenant[0]?.verify.namespace).toBe("nl2sql");
  });
});
