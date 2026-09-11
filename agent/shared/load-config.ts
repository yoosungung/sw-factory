import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export type LoadedPersona = {
  name: string;
  user_id: string;
  email: string;
  persona: string;
  type: "sessions" | "human";
  workspace?: string;
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
  agents: LoadedPersona[];
};

export async function loadAgentsYaml(path: string): Promise<AgentsFile> {
  const raw = await readFile(path, "utf8");
  const doc = parseYaml(raw) as AgentsFile;
  if (!doc?.factory_base_url || !Array.isArray(doc.agents) || !doc.prompts) {
    throw new Error("invalid agents.yaml: need factory_base_url, prompts, agents");
  }
  doc.settings = doc.settings ?? {};
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
