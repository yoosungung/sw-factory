/** 5-field UTC cron (min hour dom month dow). Supports *, lists, ranges, steps. */

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    if (matchPart(part.trim(), value, min, max)) return true;
  }
  return false;
}

function matchPart(part: string, value: number, min: number, max: number): boolean {
  if (!part) return false;
  const [range, stepStr] = part.split("/");
  const step = stepStr === undefined ? 1 : Number(stepStr);
  if (!Number.isFinite(step) || step < 1) return false;

  if (range === "*") {
    return value >= min && value <= max && (value - min) % step === 0;
  }
  if (range.includes("-")) {
    const [a, b] = range.split("-").map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (value < a || value > b) return false;
    return (value - a) % step === 0;
  }
  const n = Number(range);
  if (!Number.isFinite(n)) return false;
  return n === value;
}

export function parseCron(expr: string): string[] | null {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 ? parts : null;
}

/** Sunday is 0; 7 is accepted as Sunday. */
export function cronMatches(expr: string, date: Date): boolean {
  const parts = parseCron(expr);
  if (!parts) return false;
  const [min, hour, dom, month, dow] = parts;
  const dowValue = date.getUTCDay();
  const dowOk =
    fieldMatches(dow, dowValue, 0, 7) ||
    (dowValue === 0 && fieldMatches(dow, 7, 0, 7));
  return (
    fieldMatches(min, date.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour, date.getUTCHours(), 0, 23) &&
    fieldMatches(dom, date.getUTCDate(), 1, 31) &&
    fieldMatches(month, date.getUTCMonth() + 1, 1, 12) &&
    dowOk
  );
}

/** UTC minute key: `YYYY-MM-DDTHH:MM` */
export function fireKey(date: Date): string {
  return date.toISOString().slice(0, 16);
}
