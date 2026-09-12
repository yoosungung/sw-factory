/**
 * Register factory users listed in agents.yaml; rewrite user_id in place.
 * Invoked by register-agent-users.sh (PERSONA_PASSWORD required).
 */
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

type Agent = {
  name: string;
  user_id: string;
  email: string;
  persona: string;
  type: string;
};

type AgentsDoc = {
  agents: Agent[];
  [key: string]: unknown;
};

const base = (process.env.FACTORY_BASE_URL ?? "https://factory.askwho.net").replace(
  /\/$/,
  "",
);
const agentsFile = process.env.AGENTS_FILE!;
const password = process.env.PERSONA_PASSWORD!;
const skipHuman = process.env.SKIP_HUMAN === "1";

async function registerOrResolve(
  email: string,
  name: string,
): Promise<{ id: string; created: boolean }> {
  const reg = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (reg.status === 201) {
    const body = (await reg.json()) as { user: { id: string } };
    return { id: body.user.id, created: true };
  }
  if (reg.status === 409) {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (login.status === 200) {
      const body = (await login.json()) as { user: { id: string } };
      return { id: body.user.id, created: false };
    }
    throw new Error(
      `${email}: already registered but login failed HTTP ${login.status} ` +
        `(wrong PERSONA_PASSWORD?). Resolve id via: ` +
        `npx wrangler d1 execute sw-factory --remote --command ` +
        `"SELECT id, email FROM users WHERE email='${email}'"`,
    );
  }
  const text = await reg.text();
  throw new Error(`${email}: register HTTP ${reg.status}: ${text}`);
}

/** Replace only the user_id line belonging to this agent name block. */
function patchUserId(raw: string, agentName: string, newId: string): string {
  const lines = raw.split("\n");
  let inAgent = false;
  let patched = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const nameMatch = line.match(/^\s+- name:\s*(.+)\s*$/);
    if (nameMatch) {
      inAgent = nameMatch[1]!.trim() === agentName;
      continue;
    }
    if (inAgent && /^\s+user_id:/.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "    ";
      lines[i] = `${indent}user_id: "${newId}"`;
      patched = true;
      inAgent = false;
    }
  }
  if (!patched) {
    throw new Error(`could not patch user_id for agent ${agentName}`);
  }
  return lines.join("\n");
}

async function main() {
  let raw = await readFile(agentsFile, "utf8");
  const doc = parseYaml(raw) as AgentsDoc;
  if (!Array.isArray(doc.agents)) {
    throw new Error("agents.yaml: missing agents[]");
  }

  for (const a of doc.agents) {
    if (skipHuman && a.type === "human") {
      console.log(JSON.stringify({ msg: "skip_human", name: a.name, email: a.email }));
      continue;
    }
    const { id, created } = await registerOrResolve(a.email, a.name);
    raw = patchUserId(raw, a.name, id);
    console.log(
      JSON.stringify({
        msg: created ? "registered" : "resolved",
        name: a.name,
        email: a.email,
        user_id: id,
      }),
    );
  }

  // Drop placeholder warning once real ids are written
  raw = raw.replace(
    /# user_id MUST match[\s\S]*?# Former ids:.*\n/,
    "# user_id = factory users.id (UUID). Re-run register-agent-users.sh after adding agents.\n",
  );

  await writeFile(agentsFile, raw, "utf8");
  console.log(JSON.stringify({ msg: "wrote", path: agentsFile }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
