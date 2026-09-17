import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Checkpoint, StickyMap } from "./types";

const EMPTY: Checkpoint = {
  acked_id: null,
  read_cursor: null,
  last_catch_up_at: null,
};

export function checkpointPath(dataDir: string): string {
  return path.join(dataDir, "checkpoint.json");
}

export function stickyPath(dataDir: string): string {
  return path.join(dataDir, "sticky.json");
}

export function retryDir(dataDir: string): string {
  return path.join(dataDir, "retry");
}

export async function ensureGatewayDirs(dataDir: string): Promise<void> {
  await mkdir(retryDir(dataDir), { recursive: true });
  await mkdir(path.join(dataDir, "logs"), { recursive: true });
  await mkdir(path.join(dataDir, "schedule-fires"), { recursive: true });
}

export async function loadCheckpoint(dataDir: string): Promise<Checkpoint> {
  try {
    const raw = await readFile(checkpointPath(dataDir), "utf8");
    return { ...EMPTY, ...JSON.parse(raw) } as Checkpoint;
  } catch {
    return { ...EMPTY };
  }
}

export async function saveCheckpoint(
  dataDir: string,
  checkpoint: Checkpoint,
): Promise<void> {
  await ensureGatewayDirs(dataDir);
  await writeFile(checkpointPath(dataDir), JSON.stringify(checkpoint, null, 2));
}

export async function loadSticky(dataDir: string): Promise<StickyMap> {
  try {
    const raw = await readFile(stickyPath(dataDir), "utf8");
    return JSON.parse(raw) as StickyMap;
  } catch {
    return {};
  }
}

export async function saveSticky(dataDir: string, map: StickyMap): Promise<void> {
  await ensureGatewayDirs(dataDir);
  await writeFile(stickyPath(dataDir), JSON.stringify(map, null, 2));
}

export function stickyKey(ticketId: string, persona: string): string {
  return `${ticketId}:${persona}`;
}
