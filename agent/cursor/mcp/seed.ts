import { mkdir, writeFile } from "node:fs/promises";
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

/**
 * Login as persona user and write session cookie + mcp.json under workspace.
 * Also applies deploy/personas bundle (MEMORY seed-once, skills overwrite).
 * When `agent` + `repos` are set, ensures git checkouts and writes registry.
 */
export async function seedPersonaWorkspace(opts: {
  dataDir: string;
  factoryBaseUrl: string;
  persona: PersonaSeed;
  fetchImpl?: typeof fetch;
  personasRoot?: string;
  /** Pre-merged seed root (`/opt/persona-seed`). Takes precedence over personasRoot. */
  seedRoot?: string;
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
  await writeFile(
    path.join(cwd, ".cursor", "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          factory: {
            command: "npx",
            args: ["tsx", "agent/cursor/mcp/stdio.ts"],
            env: {
              FACTORY_BASE_URL: opts.factoryBaseUrl,
              FACTORY_SESSION_COOKIE_FILE: path.join(
                cwd,
                "secrets",
                "session.cookie",
              ),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

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
