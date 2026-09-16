import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FactoryClient, loginFactory } from "../mcp/client";
import { createFactoryMcp } from "../mcp/tools";
import {
  factoryMcpEntryPath,
  refreshFactoryMcpConfigs,
  seedPersonaWorkspace,
} from "../mcp/seed";

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function startMockFactory() {
  const comments: Array<{ id: string; body: string; ticket_id: string }> = [];
  const tickets = new Map<string, Record<string, unknown>>([
    [
      "ticket-1",
      {
        id: "ticket-1",
        title: "Implement mcp",
        project_id: "proj-1",
        status: "todo",
      },
    ],
  ]);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const cookie = req.headers.cookie ?? "";

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(req);
      if (body.email === "pm@example.com" && body.password === "password123") {
        res.writeHead(200, {
          "content-type": "application/json",
          "set-cookie": "lt_session=pm-session; Path=/; HttpOnly",
        });
        res.end(JSON.stringify({ user: { id: "user-pm", email: body.email } }));
        return;
      }
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (!cookie.includes("lt_session=")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/tickets/")) {
      const id = url.pathname.split("/").pop()!;
      if (url.pathname.endsWith("/comments")) {
        const ticketId = url.pathname.split("/")[3];
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            comments: comments.filter((c) => c.ticket_id === ticketId),
          }),
        );
        return;
      }
      const ticket = tickets.get(id);
      if (!ticket) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ticket }));
      return;
    }

    if (req.method === "POST" && /\/api\/tickets\/[^/]+\/comments$/.test(url.pathname)) {
      const ticketId = url.pathname.split("/")[3];
      const body = await readJson(req);
      const comment = {
        id: `c-${comments.length + 1}`,
        body: String(body.body),
        ticket_id: ticketId,
      };
      comments.push(comment);
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ comment }));
      return;
    }

    if (req.method === "GET" && /\/api\/projects\/[^/]+\/members$/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          members: [
            {
              user_id: "user-dev",
              role: "member",
              lane: "developer",
              email: "sw-factory@example.com",
              name: "sw-factory",
            },
            {
              user_id: "user-ta",
              role: "owner",
              lane: "ta",
              email: "ta@example.com",
              name: "ta",
            },
          ],
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise<{
    port: number;
    comments: typeof comments;
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        comments,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

describe("A4 factory-mcp", () => {
  it("logs in with session cookie and reads/comments tickets via tools", async () => {
    const factory = await startMockFactory();
    const baseUrl = `http://127.0.0.1:${factory.port}`;

    const cookie = await loginFactory({
      baseUrl,
      email: "pm@example.com",
      password: "password123",
    });
    expect(cookie).toContain("lt_session=");

    const mcp = createFactoryMcp(new FactoryClient({ baseUrl, cookie }));
    const ticket = await mcp.callTool("get_ticket", { id: "ticket-1" });
    expect(ticket.content[0].text).toContain("Implement mcp");

    const added = await mcp.callTool("add_comment", {
      ticket_id: "ticket-1",
      body: "agent notes",
    });
    expect(added.content[0].text).toContain("agent notes");
    expect(factory.comments).toHaveLength(1);

    const listed = await mcp.callTool("get_comments", { ticket_id: "ticket-1" });
    expect(listed.content[0].text).toContain("agent notes");

    const members = await mcp.callTool("list_project_members", {
      project_id: "proj-1",
    });
    expect(members.content[0].text).toContain("developer");
    expect(members.content[0].text).toContain("sw-factory");

    await factory.close();
  });

  it("seeds persona workspace cookie and mcp.json from agents.yaml sample shape", async () => {
    const factory = await startMockFactory();
    const root = path.join(process.cwd(), ".tmp-test");
    await mkdir(root, { recursive: true });
    const dataDir = await mkdtemp(path.join(root, "seed-"));
    tempDirs.push(dataDir);

    const { cwd, cookie } = await seedPersonaWorkspace({
      dataDir,
      factoryBaseUrl: `http://127.0.0.1:${factory.port}`,
      persona: {
        name: "pm",
        email: "pm@example.com",
        password: "password123",
        persona: "pm",
      },
    });

    expect(cookie).toContain("lt_session=");
    const saved = await readFile(path.join(cwd, "secrets", "session.cookie"), "utf8");
    expect(saved).toBe(cookie);
    const mcpJson = JSON.parse(
      await readFile(path.join(cwd, ".cursor", "mcp.json"), "utf8"),
    ) as {
      mcpServers: {
        factory: { args: string[]; env: Record<string, string> };
      };
    };
    expect(mcpJson.mcpServers.factory.env.FACTORY_BASE_URL).toContain(
      `http://127.0.0.1:${factory.port}`,
    );
    expect(mcpJson.mcpServers.factory.args).toEqual([
      "tsx",
      factoryMcpEntryPath(),
    ]);
    expect(path.isAbsolute(mcpJson.mcpServers.factory.args[1]!)).toBe(true);

    await factory.close();
  });

  it("refreshFactoryMcpConfigs rewrites absolute stdio entry for existing workspaces", async () => {
    const root = path.join(process.cwd(), ".tmp-test");
    await mkdir(root, { recursive: true });
    const dataDir = await mkdtemp(path.join(root, "refresh-mcp-"));
    tempDirs.push(dataDir);

    const cwd = path.join(dataDir, "workspaces", "pm");
    await mkdir(path.join(cwd, "secrets"), { recursive: true });
    await mkdir(path.join(cwd, ".cursor"), { recursive: true });
    await writeFile(path.join(cwd, "secrets", "session.cookie"), "lt_session=x", "utf8");
    await writeFile(
      path.join(cwd, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          factory: {
            command: "npx",
            args: ["tsx", "agent/cursor/mcp/stdio.ts"],
            env: {
              FACTORY_BASE_URL: "http://old.example",
              FACTORY_SESSION_COOKIE_FILE: path.join(cwd, "secrets", "session.cookie"),
            },
          },
        },
      }),
      "utf8",
    );

    const refreshed = await refreshFactoryMcpConfigs({
      dataDir,
      factoryBaseUrl: "https://factory.askwho.net",
      appRoot: "/app",
    });
    expect(refreshed).toEqual(["pm"]);

    const mcpJson = JSON.parse(
      await readFile(path.join(cwd, ".cursor", "mcp.json"), "utf8"),
    ) as {
      mcpServers: {
        factory: { args: string[]; env: Record<string, string> };
      };
    };
    expect(mcpJson.mcpServers.factory.args).toEqual([
      "tsx",
      "/app/agent/cursor/mcp/stdio.ts",
    ]);
    expect(mcpJson.mcpServers.factory.env.FACTORY_BASE_URL).toBe(
      "https://factory.askwho.net",
    );
  });
});
