import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export type LoadedRepo = {
  id: string;
  git_repo_url: string;
};

export type LoadedPersona = {
  name: string;
  user_id: string;
  email: string;
  persona: string;
  type: "sessions" | "human";
  workspace?: string;
  primary_repo?: string;
  repo_ids?: string[];
};

export type LoadedPrompts = {
  ticket_created: string;
  ticket_updated: string;
  comment_added: string;
  assignee_changed: string;
  mention: string;
  handoff: string;
  catch_up: string;
};

export type AgentsFile = {
  factory_base_url: string;
  settings: {
    model?: string;
    debounce_ms?: number;
    pool_size?: number;
    max_active_per_persona?: number;
    max_queue_per_persona?: number;
    cursor_listen?: string;
    poll_interval_ms?: number;
  };
  prompts: LoadedPrompts;
  repos?: LoadedRepo[];
  agents: LoadedPersona[];
};

/** unique([primary_repo, ...repo_ids]) — empty means no ensure. */
export function resolveAgentRepoIds(agent: LoadedPersona): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [agent.primary_repo, ...(agent.repo_ids ?? [])]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function repoCatalogById(
  repos: LoadedRepo[] | undefined,
): Map<string, LoadedRepo> {
  const map = new Map<string, LoadedRepo>();
  for (const r of repos ?? []) {
    if (!r?.id || !r.git_repo_url) {
      throw new Error("invalid agents.yaml repos[]: need id and git_repo_url");
    }
    if (map.has(r.id)) {
      throw new Error(`duplicate repos[].id: ${r.id}`);
    }
    map.set(r.id, r);
  }
  return map;
}

function validateAgentRepoRefs(doc: AgentsFile): void {
  const catalog = repoCatalogById(doc.repos);
  for (const agent of doc.agents) {
    for (const id of resolveAgentRepoIds(agent)) {
      if (!catalog.has(id)) {
        throw new Error(
          `agents.yaml: agent ${agent.name} references unknown repo id "${id}"`,
        );
      }
    }
  }
}

export async function loadAgentsYaml(path: string): Promise<AgentsFile> {
  const raw = await readFile(path, "utf8");
  const doc = parseYaml(raw) as AgentsFile;
  if (!doc?.factory_base_url || !Array.isArray(doc.agents) || !doc.prompts) {
    throw new Error("invalid agents.yaml: need factory_base_url, prompts, agents");
  }
  doc.settings = doc.settings ?? {};
  doc.repos = doc.repos ?? [];
  validateAgentRepoRefs(doc);
  return doc;
}

export function parseListenAddr(addr: string): { host: string; port: number } {
  const [host, portStr] = addr.split(":");
  const port = Number(portStr);
  if (!host || !Number.isFinite(port)) {
    throw new Error(`invalid cursor_listen: ${addr}`);
  }
  return { host, port };
}
