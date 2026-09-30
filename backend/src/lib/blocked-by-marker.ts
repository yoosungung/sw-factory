const MARKER = /<!--\s*blocked-by:([^>]*)-->/i;

/** Parse soft A9 marker ids from ticket description (dual-read). */
export function parseBlockedByIds(description: string): string[] {
  const m = MARKER.exec(description);
  if (!m?.[1]) return [];
  return [...new Set(m[1].split(",").map((s) => s.trim()).filter(Boolean))];
}

/** Remove soft marker from description (write path uses 1급 table only). */
export function stripBlockedByMarker(description: string): string {
  if (!MARKER.test(description)) return description;
  return description
    .replace(MARKER, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}
