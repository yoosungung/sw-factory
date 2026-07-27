export interface Settings {
  mock: boolean;
  model: string;
  apiKey: string | undefined;
  workspace: string;
  port: number;
  poolSize: number;
  workerIdleMs: number;
  workerMaxAgeMs: number;
  workerMaxJobs: number;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  return {
    mock: env.AGENT_RUNNER_MOCK === "1",
    model: env.AGENT_RUNNER_MODEL ?? "composer-2.5",
    apiKey: env.CURSOR_API_KEY,
    workspace: env.WORKSPACE ?? process.cwd(),
    port: Number(env.PORT ?? "8080"),
    poolSize: Number(env.AGENT_RUNNER_POOL_SIZE ?? "2"),
    workerIdleMs: Number(env.AGENT_RUNNER_WORKER_IDLE_MS ?? String(11 * 60_000)),
    workerMaxAgeMs: Number(
      env.AGENT_RUNNER_WORKER_MAX_AGE_MS ?? String(45 * 60_000),
    ),
    workerMaxJobs: Number(env.AGENT_RUNNER_WORKER_MAX_JOBS ?? "50"),
  };
}
