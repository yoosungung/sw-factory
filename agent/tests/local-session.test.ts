import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  debugEnvContents,
  obtainGatewaySessionCookie,
} from "../shared/local-session";

function listen(
  handler: (url: URL, body: string) => { status: number; cookie?: string },
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const out = handler(url, body);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (out.cookie) headers["set-cookie"] = out.cookie;
    res.writeHead(out.status, headers);
    res.end("{}");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe("local debug gateway session", () => {
  it("uses login cookie when the user exists", async () => {
    const srv = await listen((url) => {
      if (url.pathname === "/api/auth/login") {
        return { status: 200, cookie: "lt_session=from-login; Path=/" };
      }
      return { status: 500 };
    });
    try {
      const cookie = await obtainGatewaySessionCookie({
        baseUrl: srv.baseUrl,
        email: "debug-gateway@local",
        password: "password123",
        name: "Debug Gateway",
      });
      expect(cookie).toBe("lt_session=from-login");
      expect(debugEnvContents(cookie)).toBe("GATEWAY_SESSION_COOKIE=lt_session=from-login\n");
    } finally {
      await srv.close();
    }
  });

  it("registers then returns cookie when login is 401", async () => {
    const srv = await listen((url) => {
      if (url.pathname === "/api/auth/login") return { status: 401 };
      if (url.pathname === "/api/auth/register") {
        return { status: 201, cookie: "lt_session=from-register; Path=/" };
      }
      return { status: 500 };
    });
    try {
      const cookie = await obtainGatewaySessionCookie({
        baseUrl: srv.baseUrl,
        email: "debug-gateway@local",
        password: "password123",
        name: "Debug Gateway",
      });
      expect(cookie).toBe("lt_session=from-register");
    } finally {
      await srv.close();
    }
  });

  it("logs in after register 409", async () => {
    let logins = 0;
    const srv = await listen((url) => {
      if (url.pathname === "/api/auth/login") {
        logins += 1;
        if (logins === 1) return { status: 401 };
        return { status: 200, cookie: "lt_session=after-409; Path=/" };
      }
      if (url.pathname === "/api/auth/register") return { status: 409 };
      return { status: 500 };
    });
    try {
      const cookie = await obtainGatewaySessionCookie({
        baseUrl: srv.baseUrl,
        email: "debug-gateway@local",
        password: "password123",
        name: "Debug Gateway",
      });
      expect(cookie).toBe("lt_session=after-409");
    } finally {
      await srv.close();
    }
  });
});
