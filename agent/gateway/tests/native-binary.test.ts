import { spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const buildScript = path.join(repoRoot, "agent/gateway/scripts/build-native.sh");

async function whichBun(): Promise<string | null> {
  const candidates = [
    process.env.BUN_BIN,
    path.join(os.homedir(), ".bun/bin/bun"),
    "bun",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (c === "bun") {
        const r = await run("which", ["bun"]);
        if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
      } else {
        await access(c);
        return c;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout: ${cmd} ${args.join(" ")}`));
    }, opts?.timeoutMs ?? 120_000);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe("gateway native binary (bun compile)", () => {
  let bunBin: string | null;
  let outDir: string;
  let binary: string;

  beforeAll(async () => {
    bunBin = await whichBun();
    outDir = await mkdtemp(path.join(os.tmpdir(), "swf-gw-native-"));
    binary = path.join(outDir, "sw-factory-gateway");
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("build-native.sh exists", async () => {
    await access(buildScript);
  });

  it("compiles and runs without Node on PATH", async () => {
    if (!bunBin) {
      console.warn("skip: bun not installed");
      return;
    }

    const build = await run(
      "bash",
      [buildScript, binary],
      {
        cwd: repoRoot,
        env: { ...process.env, BUN_BIN: bunBin, PATH: `${path.dirname(bunBin)}:${process.env.PATH ?? ""}` },
        timeoutMs: 180_000,
      },
    );
    expect(build.code, build.stderr || build.stdout).toBe(0);
    await chmod(binary, 0o755);

    const usage = await run(binary, [], {
      env: { PATH: "/usr/bin:/bin" },
      timeoutMs: 10_000,
    });
    expect(usage.code).toBe(1);
    expect(usage.stderr + usage.stdout).toMatch(/--config/);

    const noCookie = await run(
      binary,
      [
        "--config",
        path.join(repoRoot, "agent/cursor/reference/agents.yaml.sample"),
        "--data-dir",
        path.join(outDir, "data"),
      ],
      {
        env: {
          PATH: "/usr/bin:/bin",
          FACTORY_BASE_URL: "http://127.0.0.1:9",
        },
        timeoutMs: 10_000,
      },
    );
    expect(noCookie.code).toBe(1);
    expect(noCookie.stderr + noCookie.stdout).toMatch(/GATEWAY_SESSION_COOKIE/);

    const dataDir = path.join(outDir, "run-data");
    await mkdir(dataDir, { recursive: true });
    const cookieFile = path.join(outDir, "cookie");
    await writeFile(cookieFile, "lt_session=smoke-test-cookie", "utf8");

    const child = spawn(
      binary,
      [
        "--config",
        path.join(repoRoot, "agent/cursor/reference/agents.yaml.sample"),
        "--data-dir",
        dataDir,
      ],
      {
        env: {
          PATH: "/usr/bin:/bin",
          FACTORY_BASE_URL: "http://127.0.0.1:9",
          GATEWAY_SESSION_COOKIE: "lt_session=smoke-test-cookie",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout?.on("data", (d) => {
      out += String(d);
    });
    child.stderr?.on("data", (d) => {
      out += String(d);
    });
    await new Promise((r) => setTimeout(r, 1500));
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.on("close", () => resolve()));
    expect(out).toMatch(/gateway_start/);
  }, 180_000);
});
