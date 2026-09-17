/** Serialize tick/loop errors so undici `error.cause` is visible in logs. */
export function formatTickError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.name ? `${err.name}: ${err.message}` : err.message];
  let cur: unknown = err.cause;
  let depth = 0;
  while (cur instanceof Error && depth < 3) {
    const code =
      "code" in cur && typeof (cur as { code?: unknown }).code === "string"
        ? (cur as { code: string }).code
        : undefined;
    const address =
      "address" in cur && typeof (cur as { address?: unknown }).address === "string"
        ? (cur as { address: string }).address
        : undefined;
    const port =
      "port" in cur && typeof (cur as { port?: unknown }).port === "number"
        ? (cur as { port: number }).port
        : undefined;
    const detail = [
      code,
      address && port != null ? `${address}:${port}` : address,
      cur.message,
    ]
      .filter(Boolean)
      .join(" ");
    parts.push(detail || String(cur));
    cur = cur.cause;
    depth += 1;
  }
  return parts.join(" | ");
}
