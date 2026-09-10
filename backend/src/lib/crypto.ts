export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function hashPassword(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${bufferToHex(salt)}:${password}`),
  );
  return `v1.${bufferToHex(salt)}.${bufferToHex(new Uint8Array(material))}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
  secret: string,
): Promise<boolean> {
  const [version, saltHex, hashHex] = stored.split(".");
  if (version !== "v1" || !saltHex || !hashHex) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const material = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${saltHex}:${password}`),
  );
  return bufferToHex(new Uint8Array(material)) === hashHex;
}

function bufferToHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const SESSION_COOKIE = "lt_session";
export const SESSION_DAYS = 14;

export function sessionCookie(value: string, maxAgeSec: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}
