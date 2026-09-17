import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function scheduleFiresDir(dataDir: string): string {
  return path.join(dataDir, "schedule-fires");
}

export function scheduleFirePath(
  dataDir: string,
  scheduleId: string,
  minuteKey: string,
): string {
  const safe = `${scheduleId}__${minuteKey}`.replaceAll("/", "_");
  return path.join(scheduleFiresDir(dataDir), `${safe}.claimed`);
}

/** Returns true if this process claimed the fire (first writer wins). */
export async function claimScheduleFire(
  dataDir: string,
  scheduleId: string,
  minuteKey: string,
): Promise<boolean> {
  await mkdir(scheduleFiresDir(dataDir), { recursive: true });
  const file = scheduleFirePath(dataDir, scheduleId, minuteKey);
  try {
    await writeFile(file, minuteKey, { flag: "wx" });
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    throw err;
  }
}
