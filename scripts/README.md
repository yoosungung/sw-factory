# Native local run (no Docker)

`agent:cursor` / `agent:gateway` (+ 선택 Vite). **Docker와 동일 작업 파일**:

| 경로 | 용도 |
|------|------|
| [`deploy/local/.env`](../deploy/local/) | `FACTORY_BASE_URL`, `GATEWAY_SESSION_COOKIE`, `CURSOR_API_KEY`, … |
| `deploy/local/.local-data/` | agent data (`DATA_HOST`, 컨테이너 `/data`와 동일) |
| [`deploy/agents.yaml`](../deploy/agents.yaml) | agents 정본 (없으면 example에서 생성) |

Docker: [../deploy/local/run-docker.sh](../deploy/local/run-docker.sh) · `stop-docker.sh`.  
`deploy/local/run-local.sh` / `stop-local.sh` → 이 디렉터리로 위임.

```bash
cd deploy/local
cp ../env.example .env
# 기본 FACTORY_BASE_URL=https://factory.askwho.net
# 로컬 factory면: FACTORY_BASE_URL=http://localhost:5173
./obtain-cookie.sh          # GATEWAY_SESSION_COOKIE (원격 필수)
./register-agent-users.sh   # 선택
./seed-personas.sh          # 선택 (또는 SEED_PERSONA_COOKIES=1)

npm run local:run           # 루트 · 또는 ./run-local.sh
npm run local:stop
```

| 스크립트 | 역할 |
|----------|------|
| `run-local.sh` | `.env` 기준 factory → cursor(+gateway); localhost면 Vite+migrate |
| `stop-local.sh` | `.tools/local-pids/*.pid` 트리 종료 |

기본: cursor **mock**. 실 SDK는 `.env`의 `CURSOR_API_KEY` (`FORCE_MOCK=1`이면 mock).

| 변수 | 기본 | 설명 |
|------|------|------|
| (`.env`) `FACTORY_BASE_URL` | `https://factory.askwho.net` | factory API |
| (`.env`) `GATEWAY_SESSION_COOKIE` | — | 원격 필수 (`obtain-cookie.sh`); localhost면 자동 기입 |
| `AGENTS_FILE` | `deploy/agents.yaml` | agents.yaml |
| `DATA_DIR` / `DATA_HOST` | `deploy/local/.local-data` | agent data |
| `START_VITE` | `0` | 원격일 때 `1`이면 Vite도 기동 |
| `LOCAL_MIGRATE` | `0` | 원격일 때 `1`이면 local D1 migrate |
| `SKIP_MIGRATE` / `SKIP_VITE` / `SKIP_AGENT` | — | 강제 생략 |
| `SEED_PERSONA_COOKIES` | `0` | `1`이면 기동 전 seed-cookies |
| `ENSURE_REPOS` | `0` | `1`이면 기동 전 ensure-repos |
| `FORCE_MOCK` | `0` | `1`이면 API key 있어도 mock |

프로세스 로그: `.tools/local-logs/` (gitignore). PID: `.tools/local-pids/`.
