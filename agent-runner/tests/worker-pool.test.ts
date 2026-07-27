import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { WorkerPool } from "../src/worker-pool.js";

const mockWorker = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "mock-worker.mjs",
);

const pools: WorkerPool[] = [];
const flagFiles: string[] = [];

afterEach(async () => {
  while (pools.length > 0) {
    const p = pools.pop();
    await p?.close();
  }
  for (const f of flagFiles.splice(0)) {
    try {
      fs.unlinkSync(f);
    } catch {
      // ignore
    }
  }
});

function authFlag(): string {
  const f = path.join(os.tmpdir(), `mock-auth-${Date.now()}-${Math.random()}.flag`);
  fs.writeFileSync(f, "1");
  flagFiles.push(f);
  return f;
}

function createPool(
  env: Record<string, string>,
  overrides: Partial<ConstructorParameters<typeof WorkerPool>[0]> = {},
): WorkerPool {
  const pool = new WorkerPool({
    size: 1,
    idleMs: 60_000,
    maxAgeMs: 3_600_000,
    maxJobs: 100,
    workerScript: mockWorker,
    env: { ...process.env, ...env },
    retireBackoffMs: 0,
    ...overrides,
  });
  pools.push(pool);
  return pool;
}

describe("WorkerPool", () => {
  it("submits create and resolves accepted then done", async () => {
    const pool = createPool({ MOCK_WORKER_MODE: "ok" });
    await pool.start();

    const submitted = await pool.submit({
      type: "create",
      prompt: "hi",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    expect(submitted.agentId).toMatch(/^mock-/);
    expect(submitted.runId).toMatch(/^run-/);

    const done = await submitted.done;
    expect(done.status).toBe("finished");
    expect(done.resultPreview).toBe("ok");
  });

  it("retires and retries once when send fails with auth", async () => {
    const pool = createPool({
      MOCK_WORKER_MODE: "ok",
      MOCK_AUTH_FLAG_FILE: authFlag(),
    });
    await pool.start();

    const submitted = await pool.submit({
      type: "create",
      prompt: "hi",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    const done = await submitted.done;
    expect(done.status).toBe("finished");
  });

  it("retires and retries when wait returns auth error", async () => {
    const pool = createPool({
      MOCK_WORKER_MODE: "ok",
      MOCK_AUTH_FLAG_FILE: authFlag(),
      MOCK_AUTH_PHASE: "wait",
    });
    await pool.start();

    const submitted = await pool.submit({
      type: "create",
      prompt: "hi",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    const done = await submitted.done;
    expect(done.status).toBe("finished");
  });

  it("recycles worker when maxJobs reached before lease", async () => {
    let clock = 1_000_000;
    const pool = createPool(
      { MOCK_WORKER_MODE: "ok" },
      {
        maxJobs: 1,
        now: () => clock,
      },
    );
    await pool.start();

    const first = await pool.submit({
      type: "create",
      prompt: "a",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    await first.done;

    const second = await pool.submit({
      type: "create",
      prompt: "b",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    await second.done;
    expect(second.agentId).toBeTruthy();
  });

  it("recycles idle worker before lease", async () => {
    let clock = 1_000_000;
    const pool = createPool(
      { MOCK_WORKER_MODE: "ok" },
      {
        idleMs: 1000,
        now: () => clock,
      },
    );
    await pool.start();

    const first = await pool.submit({
      type: "create",
      prompt: "a",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    await first.done;

    clock += 5000;
    const second = await pool.submit({
      type: "prompt",
      agentId: first.agentId,
      prompt: "b",
      model: "composer-2.5",
      workspace: "/tmp",
    });
    await second.done;
    expect(second.agentId).toBe(first.agentId);
  });
});
