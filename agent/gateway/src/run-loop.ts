import { tick, type TickDeps } from "./loop";

export type RunLoopOptions = TickDeps & {
  intervalMs: number;
  signal?: AbortSignal;
  onTick?: (result: Awaited<ReturnType<typeof tick>>) => void;
  onError?: (err: unknown) => void;
};

/** Poll Worker outbox forever (or until abort). */
export async function runLoop(opts: RunLoopOptions): Promise<void> {
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      opts.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    });

  while (!opts.signal?.aborted) {
    try {
      const result = await tick({ config: opts.config, fetchImpl: opts.fetchImpl });
      opts.onTick?.(result);
    } catch (err) {
      opts.onError?.(err);
    }
    try {
      await sleep(opts.intervalMs);
    } catch {
      break;
    }
  }
}
