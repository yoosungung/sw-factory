import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { retryDir } from "./checkpoint";
import type { AgentEvent, RetryItem } from "./types";

function retryKey(ticketId: string, persona: string): string {
  return `${ticketId}__${persona}.json`;
}

export async function upsertRetry(
  dataDir: string,
  item: Omit<RetryItem, "updated_at" | "attempts"> & { attempts?: number },
): Promise<void> {
  const dir = retryDir(dataDir);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, retryKey(item.ticket_id, item.persona));
  let attempts = item.attempts ?? 1;
  try {
    const prev = JSON.parse(await readFile(file, "utf8")) as RetryItem;
    attempts = (prev.attempts ?? 0) + 1;
  } catch {
    // new
  }
  const next: RetryItem = {
    ticket_id: item.ticket_id,
    persona: item.persona,
    prompt: item.prompt,
    event: item.event,
    attempts,
    updated_at: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(next, null, 2));
}

export async function listRetries(dataDir: string): Promise<RetryItem[]> {
  const dir = retryDir(dataDir);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const items: RetryItem[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, f), "utf8");
      items.push(JSON.parse(raw) as RetryItem);
    } catch {
      // skip bad
    }
  }
  // round-robin by persona: sort by updated_at then group
  items.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  return items;
}

export async function removeRetry(
  dataDir: string,
  ticketId: string,
  persona: string,
): Promise<void> {
  try {
    await unlink(path.join(retryDir(dataDir), retryKey(ticketId, persona)));
  } catch {
    // ignore
  }
}

export async function enqueueEventRetry(
  dataDir: string,
  ticketId: string,
  persona: string,
  prompt: string,
  event: AgentEvent,
): Promise<void> {
  await upsertRetry(dataDir, { ticket_id: ticketId, persona, prompt, event });
}
