import { serve } from "@hono/node-server";
import type { RunnerApp } from "./server";

export type ListenHandle = {
  port: number;
  host: string;
  close: () => Promise<void>;
};

/** Bind runner Hono app to loopback (or given host). */
export function listenRunner(
  runner: RunnerApp,
  opts: { host: string; port: number },
): Promise<ListenHandle> {
  return new Promise((resolve, reject) => {
    try {
      const server = serve(
        {
          fetch: runner.app.fetch,
          hostname: opts.host,
          port: opts.port,
        },
        (info) => {
          resolve({
            host: opts.host,
            port: info.port,
            close: () =>
              new Promise((r, j) => {
                server.close((err) => (err ? j(err) : r()));
              }),
          });
        },
      );
    } catch (err) {
      reject(err);
    }
  });
}
