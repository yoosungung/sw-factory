/** MIME types safe to open inline in a same-origin browser tab. */
const INLINE_MIME_ALLOWLIST = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

/** Normalize `text/plain; charset=utf-8` → `text/plain`. */
export function baseMime(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isInlineViewableMime(mime: string): boolean {
  return INLINE_MIME_ALLOWLIST.has(baseMime(mime));
}

/** `Content-Disposition` value: inline allowlist vs attachment (HTML/SVG excluded). */
export function contentDispositionForMime(mime: string, filename: string): string {
  const kind = isInlineViewableMime(mime) ? "inline" : "attachment";
  const safe = filename.replace(/["\\\r\n]/g, "_");
  return `${kind}; filename="${safe}"`;
}
