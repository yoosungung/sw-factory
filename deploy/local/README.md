# Agent local Docker run

로컬에서 이미지 기동·쿠키 취득. 이미지: [../docker/](../docker/).  
**agents 정본:** [`../agents.yaml`](../agents.yaml) (`./agents.yaml` → 심볼릭 링크).  
예제: [`../env.example`](../env.example) · [`../agents.yaml.example`](../agents.yaml.example).

```bash
cd deploy/local
cp ../env.example .env
./obtain-cookie.sh    # 선택
./run-local.sh        # 이미지 없으면 ../docker/build.sh 호출
./stop-local.sh
```

작업 파일(gitignore): `./.env` · `../agents.yaml` · `./.local-data/` → 컨테이너 `/data`.

| 변수 | 필수 | 설명 |
|------|------|------|
| `FACTORY_BASE_URL` | 예 | 기본 `https://factory.askwho.net` |
| `GATEWAY_SESSION_COOKIE` | 예 | `lt_session=…` |
| `CURSOR_API_KEY` | 실 SDK 시 | 없으면 mock |
| `AGENT_BACKEND` | 아니오 | `mock` 강제 |
| `AGENTS_FILE` | 아니오 | 기본 `deploy/agents.yaml` |

| 스크립트 | 역할 |
|----------|------|
| `./obtain-cookie.sh` | 로그인 → `.env` |
| `./seed-personas.sh` | sessions persona 쿠키·mcp·MEMORY/skills 시드 |
| `./run-local.sh` | Docker 기동 |
| `./stop-local.sh` | 중지·삭제 |
