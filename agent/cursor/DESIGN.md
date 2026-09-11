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
| R1–R5 zombie recovery | Dual-loop 정책의 배달 (배달은 gateway) |

## Layout (목표)

```
agent/cursor/
  README.md
  DESIGN.md
  docs/
  reference/
  src/              # runner 구현 후속 (A3)
  mcp/              # factory-mcp 후속 (A4)
```

런타임 데이터(PVC): `/data/workspaces/{name}/` — [docs/04-pvc-layout.md](docs/04-pvc-layout.md).

## 내부 모듈 (설계)

| 모듈 | 대응 (GH) | 책임 |
|------|-----------|------|
| `parent` | Hono server | HTTP, 큐, 뮤텍스, pool lease (SDK 미로드) |
| `worker` | SDK child | create/resume → send → wait → close |
| `session-map` | ticket↔agent_id | sticky session (gateway sticky rebind와 협조) |
| `recover` | R1–R5 | zombie `active_run` |
| `factory-mcp` | leantime-mcp | Worker REST 도구 + 세션 쿠키 |

## Commands

코드 없음. 구현 마일스톤(A3–A4)에서 채운다.
