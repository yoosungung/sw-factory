import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { loadSettings } from "./config.js";
import { buildBackend } from "./session-manager.js";

const settings = loadSettings();
const backend = buildBackend(settings);
const app = createApp(settings, backend);

const server = serve(
  {
    fetch: app.fetch,
    port: settings.port,
  },
  (info) => {
    console.log(`agent-runner listening on :${info.port}`);
  },
);

async function shutdown(): Promise<void> {
  await backend.close?.();
  server.close();
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
