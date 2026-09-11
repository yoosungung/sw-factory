# factory-mcp

GitHub `leantime-mcp`(JSON-RPC + PAT) 대신 Worker **REST + 세션 쿠키**를 MCP 도구로 감싼다.

인증: [07-auth-as-user](07-auth-as-user.md). PAT/`x-api-key` 신설 없음 (ARCHITECTURE Exclude 유지).

## 도구 매핑 (초안)

| MCP tool | Worker |
|----------|--------|
| `get_ticket` | `GET /api/tickets/:id` |
| `list_tickets` | `GET /api/projects/:id/tickets` (+ assignee/me 필터) |
| `create_ticket` | `POST /api/projects/:id/tickets` |
| `update_ticket` | `PATCH /api/tickets/:id` (+ `version` 권장) |
| `get_comments` | `GET /api/tickets/:id/comments` |
| `add_comment` | `POST /api/tickets/:id/comments` |
| `list_projects` / `get_project` | `/api/projects` … |
| `search` | `GET /api/search?q=` |

## 동작 규칙

1. **읽기 우선** — Active ticket이 있으면 먼저 get_ticket / get_comments (GH §1.7).
2. 이벤트 세션의 쓰기는 Active `ticket_id`에 고정 (gateway가 prompt에 심은 스코프).
3. catch-up·스케줄은 스코프 없음; actionable 1건 선택 후 그 티켓에만 쓰기.
4. MCP는 persona workspace의 `.cursor/mcp.json`이 가리키며, 쿠키는 그 persona 것.

구현: [../mcp/](../mcp/) (A4). 도구 매핑·세션 쿠키 계약은 이 문서.
