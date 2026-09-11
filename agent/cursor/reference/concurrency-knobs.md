# Concurrency knobs

| knob | env / yaml | 기본 | 의미 |
|------|------------|------|------|
| `pool_size` | `AGENT_RUNNER_POOL_SIZE` / `settings.pool_size` | 2 | 동시 SDK worker |
| `max_active_per_persona` | settings | 1 | persona 공정성 |
| `max_queue_per_persona` | settings | 32 | persona 대기 상한 |
| `worker_idle_ms` | `AGENT_RUNNER_WORKER_IDLE_MS` | 660000 | pre-lease idle |
| `worker_max_age_ms` | `AGENT_RUNNER_WORKER_MAX_AGE_MS` | 2700000 | pre-lease age |
| `worker_max_jobs` | `AGENT_RUNNER_WORKER_MAX_JOBS` | 50 | pre-lease jobs |
| `debounce_ms` | settings | 2000 | gateway 이벤트 병합 |
| `gateway_retry_max_attempts` | gateway | 5 | Bridge급 |
| `active_run_skip_limit` | cursor | 2 | R3 threshold |

컨테이너 memory/CPU limits와 `pool_size`를 함께 올린다. persona 수 ≫ pool 이면 대기·409가 정상이다.
