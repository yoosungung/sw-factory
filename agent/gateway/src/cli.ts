#!/usr/bin/env node
import path from "node:path";
import { loadAgentsYaml } from "../../shared/load-config";
import { formatTickError } from "./errors";
import type { GatewayConfig } from "./types";
import { runLoop } from "./run-loop";

function usage(): never {
  console.error(
    "Usage: tsx agent/gateway/src/cli.ts --config <agents.yaml> [--data-dir /data/gateway]",
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

  const dataDir =
    arg("--data-dir") ??
    process.env.GATEWAY_DATA_DIR ??
    path.join(process.env.DATA_DIR ?? "/data", "gateway");

  const file = await loadAgentsYaml(configPath);
  const cookie =
    process.env.GATEWAY_SESSION_COOKIE ??
    process.env.FACTORY_SESSION_COOKIE;
  if (!cookie) {
    console.error("Set GATEWAY_SESSION_COOKIE (lt_session=…)");
    process.exit(1);
  }

  const listen = file.settings.cursor_listen ?? "127.0.0.1:8080";
  const cursorBaseUrl = process.env.CURSOR_BASE_URL ?? `http://${listen}`;

  const config: GatewayConfig = {
    factoryBaseUrl: process.env.FACTORY_BASE_URL ?? file.factory_base_url,
    cursorBaseUrl,
    dataDir,
    sessionCookie: cookie.startsWith("lt_session=") ? cookie : `lt_session=${cookie}`,
    agents: file.agents.map((a) => ({
      name: a.name,
      user_id: a.user_id,
      email: a.email,
      persona: a.persona,
      type: a.type,
    })),
    prompts: file.prompts,
    debounceMs: file.settings.debounce_ms ?? 2000,
    pollLimit: 100,
    retryMaxAttempts: 5,
    schedules: file.settings.schedules ?? [],
    successChecks: file.settings.success_checks ?? [],
  };

  const intervalMs = file.settings.poll_interval_ms ?? 3000;
  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());
  process.on("SIGTERM", () => ac.abort());

  console.log(
    JSON.stringify({
      msg: "gateway_start",
      factory: config.factoryBaseUrl,
      cursor: config.cursorBaseUrl,
      dataDir,
      intervalMs,
    }),
  );

  await runLoop({
    config,
    intervalMs,
    signal: ac.signal,
    onTick: (r) => {
      if (r.processed > 0 || r.dispatched.length > 0) {
        console.log(JSON.stringify({ msg: "tick", ...r }));
      }
    },
    onError: (err) => {
      console.error(JSON.stringify({ msg: "tick_error", error: formatTickError(err) }));
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
