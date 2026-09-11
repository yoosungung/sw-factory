import path from "node:path";
import { mkdir } from "node:fs/promises";

/** PVC contract: /data/workspaces/{persona} */
export function personaCwd(dataDir: string, persona: string): string {
  return path.join(dataDir, "workspaces", persona);
}

export async function ensurePersonaWorkspace(
  dataDir: string,
  persona: string,
): Promise<string> {
  const cwd = personaCwd(dataDir, persona);
  await mkdir(path.join(cwd, ".cursor"), { recursive: true });
  await mkdir(path.join(cwd, "repos"), { recursive: true });
  await mkdir(path.join(cwd, "secrets"), { recursive: true });
  return cwd;
}

export function gatewayDataDir(dataDir: string): string {
  return path.join(dataDir, "gateway");
}
