# Cursor Runtime Design

계약 정본: [ARCHITECTURE.md](../../ARCHITECTURE.md).  
상세·참고: [docs/](docs/) · [reference/](reference/).

GitHub 원본: `agent-runner` (parent + SDK worker pool, R1–R5 recovery) + `deploy/personas/`.

## 경계

| 함 | 안 함 |
|----|------|
| localhost HTTP dialect (`/sessions`, `/prompt`) | `agent_event_log` tail / 라우팅 |
| parent + SDK worker pool · 티켓 뮤텍스 | Worker로 HTTP push wake |
| persona cwd에서 MCP로 티켓 읽기/쓰기 | gateway checkpoint 관리 |
| R1–R5 zombie recovery | Dual-loop 정책형 배달 (배달은 gateway) |

## Layout

```
agent/cursor/
  README.md
  DESIGN.md
  docs/
  reference/
  src/              # A3 runner (parent HTTP · pool · mutex · recover)
  mcp/              # factory-mcp (A4)
  tests/
```

런타임 데이터(PVC): `/data/workspaces/{name}/` — [docs/04-pvc-layout.md](docs/04-pvc-layout.md).

## 내부 모듈

| 모듈 | 대응 (GH) | 책임 |
|------|-----------|------|
| `server` | Hono parent | HTTP, 큐, 뮤텍스 (SDK 미로드) |
| `pool` | SDK child slots | lease → backend send |
| `session-map` | ticket↔agent_id | sticky session |
| `recover` | R1–R5 | zombie `active_run` |
| `pvc` | workspaces | persona cwd 보장 |
| `factory-mcp` | leantime-mcp | Worker REST + 세션 쿠키 (`mcp/`) |

## Commands

```bash
# from repo root
npm run test:agent
npm test
npm run agent:cursor -- --config agent/cursor/reference/agents.yaml.sample --mock
npx tsx agent/cursor/src/seed-cli.ts --config deploy/local/agents.yaml --data-dir /tmp/swf-data
# ensures repos from yaml (set GH_TOKEN for private clones)
npx tsx agent/cursor/src/ensure-repos-cli.ts --config deploy/agents.yaml --data-dir /tmp/swf-data
# k8s/Docker: entrypoint runs ensure-repos-cli when ENSURE_REPOS≠0 (see deploy/k8s/README.md)
```

`CURSOR_API_KEY` + `@cursor/sdk` 설치 시 실 local agent; 아니면 mock.  
persona 번들: [deploy/personas/](../../deploy/personas/) · [persona-bundle.ts](src/persona-bundle.ts).
