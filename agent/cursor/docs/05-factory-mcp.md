# factory-mcp

GitHub `leantime-mcp`(JSON-RPC + PAT) 대신 Worker **REST + 세션 쿠키**를 MCP 도구로 감싼다.

인증: [07-auth-as-user](07-auth-as-user.md). PAT/`x-api-key` 신설 없음 (ARCHITECTURE Exclude 유지).

## 도구 매핑 (초안)

| MCP tool | Worker |
|----------|--------|
| `get_ticket` | `GET /api/tickets/:id` |
| `list_tickets` | `GET /api/projects/:id/tickets` (+ assignee/me, `milestone_id`) |
| `create_ticket` | `POST /api/projects/:id/tickets` |
| `update_ticket` | `PATCH /api/tickets/:id` (+ `version` 권장) |
| `get_comments` | `GET /api/tickets/:id/comments` |
| `add_comment` | `POST /api/tickets/:id/comments` |
| `edit_comment` | `PATCH /api/comments/:id` (이벤트 없음) |
| `set_blocked_by` | description `<!-- blocked-by:uuid[,uuid] -->` upsert (+ 선택 status) |
| `list_projects` / `get_project` | `/api/projects` … |
| `list_project_members` | `GET /api/projects/:id/members` (`role` + `lane`) |
| `search` | `GET /api/search?q=` |

## 동작 규칙

1. **읽기 우선** — Active ticket이 있으면 먼저 get_ticket / get_comments (GH §1.7).
2. 이벤트 세션의 쓰기는 Active `ticket_id`에 고정 (gateway가 prompt에 심은 스코프).
3. catch-up·스케줄은 스코프 없음; actionable 1건 선택 후 그 티켓에만 쓰기.
4. MCP는 persona workspace의 `.cursor/mcp.json`이 가리키며, 쿠키는 그 persona 것.
5. **stdio 진입점은 절대 경로** — seed/`apply-persona-seeds`가 `AGENT_APP_ROOT`(Docker 기본 `/app`) 기준 `…/agent/cursor/mcp/stdio.ts`를 쓴다. 상대경로면 SDK cwd(`/data/workspaces/{persona}`)에서 로드 실패한다. 기동 시 cookie가 있는 workspace의 mcp.json을 refresh한다.

구현: [../mcp/](../mcp/) (A4). 도구 매핑·세션 쿠키 계약은 이 문서.
