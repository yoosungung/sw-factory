import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadAgentsYaml, parseListenAddr } from "../shared/load-config";
import { tick } from "../gateway/src/loop";
import type { GatewayConfig } from "../gateway/src/types";
import { createMockBackend } from "../cursor/src/mock-backend";
import { createRunner } from "../cursor/src/server";
import { listenRunner } from "../cursor/src/listen";
import { createSdkBackend } from "../cursor/src/sdk-backend";
import { runLoop } from "../gateway/src/run-loop";

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function tmp(): Promise<string> {
  const root = path.join(process.cwd(), ".tmp-test");
  await mkdir(root, { recursive: true });
  const d = await mkdtemp(path.join(root, "a5-"));
  tempDirs.push(d);
  return d;
}

describe("A5 config + harness", () => {
  it("loads agents.yaml.sample", async () => {
    const sample = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../cursor/reference/agents.yaml.sample",
    );
    const file = await loadAgentsYaml(sample);
    expect(file.agents.some((a) => a.persona === "pm" && a.type === "sessions")).toBe(
      true,
    );
    expect(parseListenAddr(file.settings.cursor_listen!).port).toBe(8080);
  });

  it("createSdkBackend defaults to mock without API key", async () => {
    const backend = await createSdkBackend({ forceMock: true });
    expect(backend.mode).toBe("mock");
  });

  it("gateway tick delivers to live cursor listen (mock backend)", async () => {
    const dataDir = await tmp();
    const gwData = path.join(dataDir, "gateway");
    const cursorData = path.join(dataDir, "data");

    const events = [
      {
        id: "e-a5",
        at: "2026-01-01T00:00:00.000Z",
        event_type: "ticket_created",
        ticket_id: "t-a5",
        project_id: "p1",
        actor_user_id: "human",
        assignee_user_id: "00000000-0000-0000-0000-000000000002",
        payload: {},
      },
    ];

    const factory = createServer((req, res) => {
      if (req.url?.startsWith("/api/agent/events")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events }));
        events.length = 0; // only once
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const factoryPort = await new Promise<number>((resolve) => {
      factory.listen(0, "127.0.0.1", () => {
        const addr = factory.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    const backend = createMockBackend({ sendDelayMs: 10 });
    const runner = createRunner({
      settings: {
        dataDir: cursorData,
        poolSize: 2,
        maxActivePerPersona: 1,
        maxQueuePerPersona: 8,
        activeRunSkipLimit: 2,
        createThrottleMs: 100,
      },
      backend,
    });
    const listen = await listenRunner(runner, { host: "127.0.0.1", port: 0 });

    const yamlPath = path.join(dataDir, "agents.yaml");
    await writeFile(
      yamlPath,
      `
factory_base_url: http://127.0.0.1:${factoryPort}
settings:
  cursor_listen: 127.0.0.1:${listen.port}
  poll_interval_ms: 50
prompts:
  ticket_created: "Ticket {ticket_id} created. Active ticket_id={ticket_id}"
  ticket_updated: "u {ticket_id}"
  comment_added: "c {ticket_id}"
  assignee_changed: "a {ticket_id}"
  mention: "m {ticket_id}"
  handoff: "h {ticket_id}"
  catch_up: "catch"
agents:
  - name: pm
    user_id: "00000000-0000-0000-0000-000000000002"
    email: pm@example.com
    persona: pm
    type: sessions
`,
      "utf8",
    );

    const file = await loadAgentsYaml(yamlPath);
    const config: GatewayConfig = {
      factoryBaseUrl: file.factory_base_url,
      cursorBaseUrl: `http://127.0.0.1:${listen.port}`,
      dataDir: gwData,
      sessionCookie: "lt_session=test",
      agents: file.agents,
      prompts: file.prompts,
      debounceMs: 0,
      pollLimit: 20,
      retryMaxAttempts: 3,
    };

    const result = await tick({ config });
    expect(result.acked_id).toBe("e-a5");
    expect(result.dispatched[0]?.persona).toBe("pm");

    await new Promise((r) => setTimeout(r, 40));
    expect(backend.prompts.some((p) => p.prompt.includes("t-a5"))).toBe(true);

    // runLoop one iteration then abort
    const ac = new AbortController();
    const loopDone = runLoop({
      config,
      intervalMs: 20,
      signal: ac.signal,
    });
    await new Promise((r) => setTimeout(r, 30));
    ac.abort();
    await loopDone.catch(() => undefined);

    await listen.close();
    await new Promise<void>((r) => factory.close(() => r()));
  });
});
