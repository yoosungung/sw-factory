import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  repoCatalogById,
  resolveAgentRepoIds,
  type LoadedPersona,
  type LoadedRepo,
} from "../../shared/load-config";
import { personaCwd } from "./pvc";

export type GitRunner = (
  args: string[],
  cwd?: string,
) => Promise<{ stdout: string; stderr: string }>;

export const DEFAULT_ROADMAP_PATH = "ROADMAP.md";
export const DEFAULT_CD_PATH = ".factory/cd.yaml";

export type TenantCdVerify = {
  namespace: string;
  deployment: string;
  timeout_sec?: number;
  smoke?: {
    type?: string;
    url: string;
    expect_status?: number;
  };
};

export type EnsureRepoResult = {
  repoId: string;
  path: string;
  git_repo_url: string;
  action: "clone" | "fetch";
  client_id?: string;
  project_id?: string;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export function injectTokenIntoHttpsUrl(url: string, token: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:") {
    throw new Error(`ensureRepos: only https git urls supported: ${url}`);
  }
  u.username = "x-access-token";
  u.password = token;
  return u.toString().replace(/\/$/, "");
}

export const defaultGitRunner: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `git ${args.join(" ")} failed (code ${code}): ${stderr || stdout}`,
          ),
        );
    });
  });

export async function ensureRepo(opts: {
  dest: string;
  gitRepoUrl: string;
  token?: string;
  depth?: number;
  runGit?: GitRunner;
}): Promise<{ action: "clone" | "fetch"; path: string }> {
  const runGit = opts.runGit ?? defaultGitRunner;
  const cleanUrl = opts.gitRepoUrl;
  const authUrl =
    opts.token && opts.token.length > 0
      ? injectTokenIntoHttpsUrl(cleanUrl, opts.token)
      : cleanUrl;

  await mkdir(path.dirname(opts.dest), { recursive: true });
  const gitDir = path.join(opts.dest, ".git");

  // Host-mounted PVC may be owned by a different uid than the container user.
  await runGit([
    "config",
    "--global",
    "--add",
    "safe.directory",
    opts.dest,
  ]);

  if (!(await pathExists(gitDir))) {
    const cloneArgs = ["clone"];
    if (opts.depth && opts.depth > 0) {
      cloneArgs.push(`--depth=${opts.depth}`);
    }
    cloneArgs.push(authUrl, opts.dest);
    await runGit(cloneArgs);
    await runGit(["remote", "set-url", "origin", cleanUrl], opts.dest);
    return { action: "clone", path: opts.dest };
  }

  // Fetch with token via temporary remote URL; restore clean URL after.
  if (opts.token) {
    await runGit(["remote", "set-url", "origin", authUrl], opts.dest);
  }
  try {
    await runGit(["fetch", "--prune", "origin"], opts.dest);
    const { stdout } = await runGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      opts.dest,
    );
    const branch = stdout.trim() || "main";
    // Fast-forward only when on a branch tracking origin; ignore failure if detached.
    try {
      await runGit(["merge", "--ff-only", `origin/${branch}`], opts.dest);
    } catch {
      // dirty or no upstream — leave for tenant-repo-sync / agent to report
    }
  } finally {
    if (opts.token) {
      await runGit(["remote", "set-url", "origin", cleanUrl], opts.dest);
    }
  }

  return { action: "fetch", path: opts.dest };
}

export async function ensurePersonaRepos(opts: {
  dataDir: string;
  persona: string;
  agent: LoadedPersona;
  repos: LoadedRepo[];
  token?: string;
  depth?: number;
  runGit?: GitRunner;
}): Promise<EnsureRepoResult[]> {
  const catalog = new Map(opts.repos.map((r) => [r.id, r]));
  const ids = resolveAgentRepoIds(opts.agent);
  const cwd = personaCwd(opts.dataDir, opts.persona);
  await mkdir(path.join(cwd, "repos"), { recursive: true });

  const out: EnsureRepoResult[] = [];
  for (const id of ids) {
    const repo = catalog.get(id);
    if (!repo) {
      throw new Error(`ensurePersonaRepos: unknown repo id ${id}`);
    }
    const dest = path.join(cwd, "repos", id);
    const { action } = await ensureRepo({
      dest,
      gitRepoUrl: repo.git_repo_url,
      token: opts.token,
      depth: opts.depth,
      runGit: opts.runGit,
    });
    out.push({
      repoId: id,
      path: dest,
      git_repo_url: repo.git_repo_url,
      action,
      client_id: repo.client_id,
      project_id: repo.project_id,
    });
  }
  return out;
}

export async function writeClientsReposRegistry(opts: {
  dataDir: string;
  persona: string;
  entries: EnsureRepoResult[];
}): Promise<string> {
  const cursorDir = path.join(
    personaCwd(opts.dataDir, opts.persona),
    ".cursor",
  );
  await mkdir(cursorDir, { recursive: true });
  const regPath = path.join(cursorDir, "clients-repos-registry.json");
  const body = opts.entries.map((e) => ({
    repo_id: e.repoId,
    git_repo_url: e.git_repo_url,
    path: e.path,
    ...(e.client_id ? { client_id: e.client_id } : {}),
    ...(e.project_id ? { project_id: e.project_id } : {}),
  }));
  await writeFile(regPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return regPath;
}

/** Resolve GH token from env (GH_TOKEN or GITHUB_TOKEN). */
export function resolveGhToken(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.GH_TOKEN || env.GITHUB_TOKEN || undefined;
}

export async function loadTenantCdVerifyOverlay(
  overlayPath: string,
): Promise<Record<string, TenantCdVerify>> {
  try {
    const raw = JSON.parse(await readFile(overlayPath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, TenantCdVerify>;
  } catch {
    return {};
  }
}

export async function writeDerivedRegistries(opts: {
  dataDir: string;
  persona: string;
  agent: LoadedPersona;
  repos: LoadedRepo[];
  verifyByRepoId?: Record<string, TenantCdVerify>;
}): Promise<{ roadmap?: string; tenantCd?: string }> {
  const catalog = repoCatalogById(opts.repos);
  const cursorDir = path.join(
    personaCwd(opts.dataDir, opts.persona),
    ".cursor",
  );
  await mkdir(cursorDir, { recursive: true });
  const out: { roadmap?: string; tenantCd?: string } = {};

  if ((opts.agent.roadmaps ?? []).length > 0) {
    const repos = (opts.agent.roadmaps ?? []).map((row) => {
      const repo = catalog.get(row.repo_id);
      if (!repo) {
        throw new Error(`writeDerivedRegistries: unknown repo id ${row.repo_id}`);
      }
      return {
        repo_id: row.repo_id,
        git_repo_url: repo.git_repo_url,
        path: row.path?.trim() || DEFAULT_ROADMAP_PATH,
        ...(repo.project_id ? { project_id: repo.project_id } : {}),
        ...(repo.client_id ? { client_id: repo.client_id } : {}),
      };
    });
    const file = path.join(cursorDir, "roadmap-registry.json");
    await writeFile(file, `${JSON.stringify({ repos }, null, 2)}\n`, "utf8");
    out.roadmap = file;
  }

  if ((opts.agent.tenant_cd ?? []).length > 0) {
    const entries = (opts.agent.tenant_cd ?? []).map((row) => {
      const repo = catalog.get(row.repo_id);
      if (!repo) {
        throw new Error(`writeDerivedRegistries: unknown repo id ${row.repo_id}`);
      }
      const verify = opts.verifyByRepoId?.[row.repo_id];
      return {
        repo_id: row.repo_id,
        git_repo_url: repo.git_repo_url,
        cd_path: DEFAULT_CD_PATH,
        ...(repo.client_id ? { client_id: repo.client_id } : {}),
        ...(repo.project_id ? { project_id: repo.project_id } : {}),
        ...(verify ? { verify } : {}),
      };
    });
    const file = path.join(cursorDir, "tenant-cd-registry.json");
    await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    out.tenantCd = file;
  }

  return out;
}
