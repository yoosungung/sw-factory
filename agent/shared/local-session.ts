function cookieFromResponse(res: Response): string | null {
  const set = res.headers.get("set-cookie") ?? "";
  const m = /lt_session=[^;]+/.exec(set);
  return m ? m[0] : null;
}

export function debugEnvContents(cookie: string): string {
  return `GATEWAY_SESSION_COOKIE=${cookie}\n`;
}

export async function waitForFactory(
  baseUrl: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const base = baseUrl.replace(/\/$/, "");
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetchFn(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`factory not ready: ${base}`);
}

export async function obtainGatewaySessionCookie(opts: {
  baseUrl: string;
  email: string;
  password: string;
  name: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, "");
  const jsonHeaders = { "content-type": "application/json" };

  const login = async (): Promise<string | null> => {
    const res = await fetchFn(`${base}/api/auth/login`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email: opts.email, password: opts.password }),
    });
    if (!res.ok) return null;
    return cookieFromResponse(res);
  };

  const existing = await login();
  if (existing) return existing;

  const reg = await fetchFn(`${base}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      email: opts.email,
      password: opts.password,
      name: opts.name,
    }),
  });
  if (reg.ok) {
    const cookie = cookieFromResponse(reg);
    if (cookie) return cookie;
  } else if (reg.status !== 409) {
    throw new Error(`register ${reg.status}`);
  }

  const after = await login();
  if (after) return after;
  throw new Error("login missing session cookie");
}
