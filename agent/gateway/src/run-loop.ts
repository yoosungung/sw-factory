import { runCatchUp } from "./catch-up";
import { fireKey } from "./cron";
import { tick, type TickDeps } from "./loop";
import { tickSchedules } from "./schedule-tick";

export type RunLoopOptions = TickDeps & {
  intervalMs: number;
  signal?: AbortSignal;
  skipCatchUp?: boolean;
  onTick?: (result: Awaited<ReturnType<typeof tick>>) => void;
  onError?: (err: unknown) => void;
};

/** Poll Worker outbox forever (or until abort). Catch-up once at start; schedules on UTC minute. */
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

  if (!opts.skipCatchUp) {
    try {
      await runCatchUp({ config: opts.config, fetchImpl: opts.fetchImpl });
    } catch (err) {
      opts.onError?.(err);
    }
  }

  let lastScheduleMinute = "";

  while (!opts.signal?.aborted) {
    try {
      const result = await tick({ config: opts.config, fetchImpl: opts.fetchImpl });
      opts.onTick?.(result);
    } catch (err) {
      opts.onError?.(err);
    }

    const minute = fireKey(new Date());
    if (minute !== lastScheduleMinute) {
      lastScheduleMinute = minute;
      try {
        await tickSchedules({
          config: opts.config,
          fetchImpl: opts.fetchImpl,
        });
      } catch (err) {
        opts.onError?.(err);
      }
    }

    try {
      await sleep(opts.intervalMs);
    } catch {
      break;
    }
  }
}
