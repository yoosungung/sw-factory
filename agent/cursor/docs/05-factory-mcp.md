# factory-mcp

GitHub `leantime-mcp`(JSON-RPC + PAT) 대신 Worker **REST + 세션 쿠키**를 MCP 도구로 감싼다.

인증: [07-auth-as-user](07-auth-as-user.md). PAT/`x-api-key` 신설 없음 (ARCHITECTURE Exclude 유지).

## 도구 매핑 (초안)

| MCP tool | Worker |
|----------|--------|
| `get_ticket` | `GET /api/tickets/:id` |
| `list_tickets` | `GET /api/projects/:id/tickets` (+ assignee/me, `milestone_id`) |
| `create_ticket` | `POST /api/projects/:id/tickets` (`created_by_owner?: true` → `created_by`=project owner; 기본은 세션 유저) |
| `update_ticket` | `PATCH /api/tickets/:id` (+ `version` 권장) |
| `get_comments` | `GET /api/tickets/:id/comments` |
| `add_comment` | `POST /api/tickets/:id/comments` |
| `edit_comment` | `PATCH /api/comments/:id` (이벤트 없음) |
| `set_blocked_by` | `PUT /api/tickets/:id/dependencies` (1급 FS) + 선택 status; soft HTML 마커 write 안 함 |
| `list_projects` / `get_project` | `/api/projects` … |
| `list_project_members` | `GET /api/projects/:id/members` (`role` + `lane`) |
| `search` | `GET /api/search?q=` |

## 동작 규칙

1. **읽기 우선** — Active ticket이 있으면 먼저 get_ticket / get_comments (GH §1.7).
2. 이벤트 세션의 쓰기는 Active `ticket_id`에 고정 (gateway가 prompt에 심은 스코프).
3. catch-up·스케줄은 스코프 없음; actionable 1건 선택 후 그 티켓에만 쓰기.
4. MCP는 persona workspace의 `.cursor/mcp.json`이 가리키며, 쿠키는 그 persona 것. `GATEWAY_SESSION_COOKIE`(폴링용, 보통 pm)를 공유하지 않는다.
5. **stdio 진입점은 절대 경로** — `seed-cookies-cli` / `apply-persona-seeds`가 `AGENT_APP_ROOT`(Docker 기본 `/app`) 기준 `…/agent/cursor/mcp/stdio.ts`를 쓴다. 상대경로면 SDK cwd(`/data/workspaces/{persona}`)에서 로드 실패한다. 쿠키가 없는 workspace는 mcp.json을 쓰지 않으므로 factory 네임스페이스가 없다.

## REST fallback (MCP 부재 시)

세션에 `factory` 네임스페이스가 없으면 persona `secrets/session.cookie`로 Worker REST를 쓴다. **응답은 항상 래핑**된다.

| 메서드 | 경로 | 성공 body |
|--------|------|-----------|
| POST | `/api/projects/:id/tickets` | `{ "ticket": { "id": "…", … } }` |
| GET | `/api/tickets/:id` | `{ "ticket": { … } }` |
| GET | `/api/tickets/:id/comments` | `{ "comments": [ … ] }` |

**Create-once (티켓리스 스케줄):**

1. 동일 `date_from`(또는 당일 `created_at`) + **동일 title** 이 있으면 **reuse** — POST 하지 않음.
2. 없으면 `POST` **1회만**. id는 `json["ticket"]["id"]` (또는 `unwrapTicketId` / `ensureTicketCreateOnce` in [../mcp/ticket-id.ts](../mcp/ticket-id.ts)).
3. 파싱·IO가 애매하면 **POST 재시도 금지** — `list_tickets`/`get`으로 확인·reuse.
4. 잘못된 예: `json["id"]` → KeyError로 성공을 실패로 오인 → 다중 orphan (2026-11-14 escalation-drain).

```bash
# parse id from create response (never top-level .id)
TICKET_ID=$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["ticket"]["id"])')
```

구현: [../mcp/](../mcp/) (A4). 도구 매핑·세션 쿠키 계약은 이 문서.
