# Agent local Docker run

로컬에서 이미지 기동·쿠키 취득. 이미지: [../docker/](../docker/).  
**agents 정본:** [`../agents.yaml`](../agents.yaml) (`./agents.yaml` → 심볼릭 링크).  
예제: [`../env.example`](../env.example) · [`../agents.yaml.example`](../agents.yaml.example).

```bash
cd deploy/local
cp ../env.example .env
# PERSONA_PASSWORD 설정 (≥8)
./register-agent-users.sh   # factory users 생성 → agents.yaml user_id 기입
./obtain-cookie.sh          # gateway용 (admin/human 로그인)
./seed-personas.sh          # sessions 쿠키·mcp·MEMORY + ensureRepos
./run-local.sh
./stop-local.sh
```

## Agent `user_id` 등록

`agents.yaml`의 `user_id`는 **factory `users.id`(UUID)** 다. gateway가 이벤트 assignee/mention과 이 값을 맞춰 persona에 prompt를 보낸다.

1. **계정 생성** — `POST /api/auth/register` (`email` + `password` ≥8 + `name`).  
   편의 스크립트: `./register-agent-users.sh` (yaml의 각 agent를 등록하고 `user_id`를 덮어씀).  
   `PERSONA_PASSWORD`는 seed와 동일한 봇 비밀번호.
2. **이미 있는 human** (예: `suyoo@didim.com`) — 스크립트에 `SKIP_HUMAN=1`을 주고, id는 D1에서 조회해 yaml에 수동 기입:
   ```bash
   npx wrangler d1 execute sw-factory --remote --command \
     "SELECT id, email, name FROM users WHERE email='suyoo@didim.com'"
   ```
3. **Space/Project 초대** — 가입만으로는 티켓 권한이 없다. admin이 People에 초대한 뒤 assignee로 쓸 수 있다 ([ARCHITECTURE](../../ARCHITECTURE.md) §1.15).
4. **시드** — `./seed-personas.sh`가 email+`PERSONA_PASSWORD`로 로그인 → workspace 쿠키.

| 스크립트 | 역할 |
|----------|------|
| `./register-agent-users.sh` | register(+login resolve) → `agents.yaml` `user_id` |
| `./obtain-cookie.sh` | gateway 로그인 → `.env` |
| `./seed-personas.sh` | sessions persona 쿠키·mcp·MEMORY/skills·repos (`AGENT_APP_ROOT=/app` → 컨테이너용 mcp 절대경로) |
| `./run-local.sh` | Docker 기동 |
| `./stop-local.sh` | 중지·삭제 |

작업 파일(gitignore): `./.env` · `../agents.yaml` · `./.local-data/` → 컨테이너 `/data`.

| 변수 | 필수 | 설명 |
|------|------|------|
| `FACTORY_BASE_URL` | 예 | 기본 `https://factory.askwho.net` |
| `GATEWAY_SESSION_COOKIE` | gateway 시 | `lt_session=…` |
| `PERSONA_PASSWORD` | register/seed | 봇 계정 공유 비밀번호 (≥8) |
| `CURSOR_API_KEY` | 실 SDK 시 | 없으면 mock |
| `AGENT_BACKEND` | 아니오 | `mock` 강제 |
| `AGENTS_FILE` | 아니오 | 기본 `deploy/agents.yaml` |
| `SKIP_HUMAN` | 아니오 | `1`이면 `type: human` 등록 생략 |
