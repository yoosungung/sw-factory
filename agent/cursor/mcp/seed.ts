import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loginFactory } from "./client";
import { applyPersonaBundle, applyPreparedPersonaSeed } from "../src/persona-bundle";
import {
  ensurePersonaRepos,
  resolveGhToken,
  writeClientsReposRegistry,
  type EnsureRepoResult,
  type GitRunner,
} from "../src/ensure-repos";
import type { LoadedPersona, LoadedRepo } from "../../shared/load-config";

export type PersonaSeed = {
  name: string;
  email: string;
  password: string;
  persona: string;
};

/** Repo / image root that contains `agent/cursor/mcp/stdio.ts` (Docker: `/app`). */
export function resolveAgentAppRoot(): string {
  return process.env.AGENT_APP_ROOT ?? process.cwd();
}

export function factoryMcpEntryPath(appRoot = resolveAgentAppRoot()): string {
  return path.join(appRoot, "agent/cursor/mcp/stdio.ts");
}

/**
 * Write persona `.cursor/mcp.json` with an **absolute** stdio entry.
 * Relative `agent/cursor/mcp/stdio.ts` fails when SDK cwd is `/data/workspaces/{persona}`.
 */
export async function writeFactoryMcpJson(opts: {
  workspaceCwd: string;
  factoryBaseUrl: string;
  appRoot?: string;
}): Promise<string> {
  const entry = factoryMcpEntryPath(opts.appRoot ?? resolveAgentAppRoot());
  const cookieFile = path.join(opts.workspaceCwd, "secrets", "session.cookie");
  await mkdir(path.join(opts.workspaceCwd, ".cursor"), { recursive: true });
  await writeFile(
    path.join(opts.workspaceCwd, ".cursor", "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          factory: {
            command: "npx",
            args: ["tsx", entry],
            env: {
              FACTORY_BASE_URL: opts.factoryBaseUrl,
              FACTORY_SESSION_COOKIE_FILE: cookieFile,
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return entry;
}

/** Rewrite mcp.json for every workspace that already has a session cookie. */
export async function refreshFactoryMcpConfigs(opts: {
  dataDir: string;
  factoryBaseUrl: string;
  appRoot?: string;
}): Promise<string[]> {
  const root = path.join(opts.dataDir, "workspaces");
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const refreshed: string[] = [];
  for (const name of names) {
    const workspaceCwd = path.join(root, name);
    const cookieFile = path.join(workspaceCwd, "secrets", "session.cookie");
    try {
      await access(cookieFile);
    } catch {
      continue;
    }
    await writeFactoryMcpJson({
      workspaceCwd,
      factoryBaseUrl: opts.factoryBaseUrl,
      appRoot: opts.appRoot,
    });
    refreshed.push(name);
  }
  return refreshed;
}

/**
 * Login as persona user and write session cookie + mcp.json under workspace.
 * Also applies deploy/personas bundle (MEMORY seed-once, skills overwrite).
 * When `agent` + `repos` are set, ensures git checkouts and writes registry.
 */
export async function seedPersonaWorkspace(opts: {
  dataDir: string;
  factoryBaseUrl: string;
  fetchImpl?: typeof fetch;
  personasRoot?: string;
  /** Pre-merged seed root (`/opt/persona-seed`). Takes precedence over personasRoot. */
  seedRoot?: string;
  persona: PersonaSeed;
  agent?: LoadedPersona;
  repos?: LoadedRepo[];
  ghToken?: string;
  runGit?: GitRunner;
}): Promise<{
  cwd: string;
  cookie: string;
  reposEnsured: EnsureRepoResult[];
}> {
  const cwd = path.join(opts.dataDir, "workspaces", opts.persona.persona);
  await mkdir(path.join(cwd, "secrets"), { recursive: true });
  await mkdir(path.join(cwd, ".cursor"), { recursive: true });

  const cookie = await loginFactory({
    baseUrl: opts.factoryBaseUrl,
    email: opts.persona.email,
    password: opts.persona.password,
    fetchImpl: opts.fetchImpl,
  });

  await writeFile(path.join(cwd, "secrets", "session.cookie"), cookie, "utf8");
  await writeFactoryMcpJson({
    workspaceCwd: cwd,
    factoryBaseUrl: opts.factoryBaseUrl,
  });

  const personasRoot =
    opts.personasRoot ?? path.resolve(process.cwd(), "deploy/personas");
  if (opts.seedRoot) {
    await applyPreparedPersonaSeed({
      dataDir: opts.dataDir,
      persona: opts.persona.persona,
      seedRoot: opts.seedRoot,
    });
  } else {
    await applyPersonaBundle({
      dataDir: opts.dataDir,
      persona: opts.persona.persona,
      personasRoot,
    });
  }
  let reposEnsured: EnsureRepoResult[] = [];
  if (opts.agent && opts.repos) {
    reposEnsured = await ensurePersonaRepos({
      dataDir: opts.dataDir,
      persona: opts.persona.persona,
      agent: opts.agent,
      repos: opts.repos,
      token: opts.ghToken ?? resolveGhToken(),
      runGit: opts.runGit,
    });
    await writeClientsReposRegistry({
      dataDir: opts.dataDir,
      persona: opts.persona.persona,
      entries: reposEnsured,
    });
  }

  return { cwd, cookie, reposEnsured };
}
