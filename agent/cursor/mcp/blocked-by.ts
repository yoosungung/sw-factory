const MARKER = /<!--\s*blocked-by:([^>]*)-->/i;

export function upsertBlockedByMarker(
  description: string,
  blockerIds: string[],
): string {
  const ids = [...new Set(blockerIds.map((id) => id.trim()).filter(Boolean))];
  const next = ids.length ? `<!-- blocked-by:${ids.join(",")} -->` : "";
  if (MARKER.test(description)) {
    const replaced = description.replace(MARKER, next);
    return replaced.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd() +
      (description.endsWith("\n") && next ? "\n" : next ? "\n" : "");
  }
  if (!next) return description;
  const body = description.trimEnd();
  return body ? `${body}\n\n${next}\n` : `${next}\n`;
}
