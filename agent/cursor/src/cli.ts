#!/usr/bin/env node
import path from "node:path";
import { loadAgentsYaml, parseListenAddr } from "../../shared/load-config";
import { createRunner } from "./server";
import { listenRunner } from "./listen";
import { createSdkBackend } from "./sdk-backend";

function usage(): never {
  console.error(
    "Usage: tsx agent/cursor/src/cli.ts --config <agents.yaml> [--data-dir /data] [--mock]",
  );
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const configPath = arg("--config") ?? process.env.AGENTS_YAML;
  if (!configPath) usage();
  const forceMock = process.argv.includes("--mock") || process.env.AGENT_BACKEND === "mock";

  const dataDir = arg("--data-dir") ?? process.env.DATA_DIR ?? "/data";
  const file = await loadAgentsYaml(configPath);
  const listen = parseListenAddr(file.settings.cursor_listen ?? "127.0.0.1:8080");

  const backend = await createSdkBackend({
    model: file.settings.model,
    forceMock,
  });

  const runner = createRunner({
    settings: {
      dataDir,
      poolSize: file.settings.pool_size ?? 2,
      maxActivePerPersona: file.settings.max_active_per_persona ?? 1,
      maxQueuePerPersona: file.settings.max_queue_per_persona ?? 32,
      activeRunSkipLimit: 2,
      createThrottleMs: 2000,
    },
    backend,
  });

  const handle = await listenRunner(runner, listen);
  console.log(
    JSON.stringify({
      msg: "cursor_listen",
      host: handle.host,
      port: handle.port,
      backend: backend.mode,
      dataDir: path.resolve(dataDir),
    }),
  );

  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
