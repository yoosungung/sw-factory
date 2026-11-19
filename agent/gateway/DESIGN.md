# Gateway Design

계약 정본: [ARCHITECTURE.md](../../ARCHITECTURE.md).  
상세·참고: [docs/](docs/) · [reference/](reference/).

GitHub 원본 개념: CursorBridge Listener / Router / DeferredDispatch / ResilientRunnerClient.

## 경계

| 함 | 안 함 |
|----|------|
| `agent_event_log` tail (`after_id`) | 티켓 본문 해석·비즈니스 판단 |
| assignee / @mention / self-echo / debounce | MCP 호출 |
| prompt 조립 → cursor에 전달 | `add_comment` / `PATCH ticket` |
| 로컬 retry 큐 · `acked_id` checkpoint | SDK import / inference |
| `settings.schedules[]` 로컬 cron · catch-up | Worker Cron `schedule_tick` outbox |
| HITL mail (human approval/mention → ops 메일) | SPA/API notifications 제품 · PM 메일 도구 · 제2 outbox 컨슈머 |

**갭(의도):** FS `dependency_cleared`는 Worker가 후속 `ticket_updated`로 append한다. gateway는 기존 assignee/`ticket_updated` 라우팅만 쓰며 전용 prompt 분기는 두지 않는다.

**HITL mail:** 동일 tick에서 `type: human`에 대한 `waiting_for_approval`(payload `status`) 또는 `@mention`만 메일 발송. 기본 경로는 Worker `POST /api/agent/hitl-mail`(Cloudflare `send_email` 바인딩 `HITL_EMAIL`)이며, `HITL_GMAIL_*` OAuth가 모두 있으면 Gmail API를 쓴다. `HITL_MAIL_TO`가 없으면 no-op. 실패해도 `acked_id`는 막지 않는다. dedupe는 `data-dir/hitl-mail-sent.json`(TTL).

## Layout

```
agent/gateway/
  README.md
  DESIGN.md
  docs/
  reference/
  scripts/      # build-native.sh (bun --compile)
  src/          # tail · router · prompts · dispatch · retry · loop · schedule-tick · catch-up · hitl-mail
  tests/        # mock cursor E2E + native binary smoke
  dist/         # sw-factory-gateway (gitignore; build artifact)
```

## 내부 모듈

| 모듈 | 대응 (GH) | 책임 |
|------|-----------|------|
| `tail` | Listener + tick | Worker `GET /api/agent/events?after_id=` (네트워크 실패 시 짧은 재시도; `tick_error`에 `cause` 포함) |
| `router` | Router | 대상 persona, self-echo skip, mention |
| `prompts` | `bridge.json` prompts | 이벤트 타입별 템플릿 + Active ticket 스코프 |
| `dispatch` | RunnerClient | cursor `POST /sessions` · `/prompt` (localhost) |
| `retry` | ResilientRunnerClient | 409/5xx → `/data/gateway/retry/` 큐 |
| `checkpoint` | SQLite sessions/ready | `acked_id`는 accept 또는 409 busy/mutex hold 후 전진. 5xx는 정지. `last_catch_up_at` |
| `loop` | tick | pull → route → dispatch → checkpoint; stdout `msg: tick`의 `dispatched[]`에 `ticket_id`(이벤트 UUID, ticketless는 null) + `ticket_no`(UI issueKey, 예: SWF-EA2D) + `agent_id`(Cursor session) |
| `schedule-tick` | ScheduleTicker | 로컬 UTC cron · gates · `(id, minute)` dedupe → 티켓리스 `POST /sessions` |
| `catch-up` | ReadyCatchupTicker | 기동 시 `prompts.catch_up` 1회 (sessions persona) |
| `manual-prompt` | (outbox) | `event_type=manual_prompt` → target resolve → `deliverTicketless`(티켓리스) 또는 Active 스코프 `deliverOne`; 동일 payload 분단위 claim dedupe |
| `hitl-mail` | (ops) | human HITL 감지 → Cloudflare Worker(`/api/agent/hitl-mail`) 또는 Gmail API send; ack 비차단 |

환경(선택): `HITL_MAIL_TO`, `HITL_MAIL_FROM`(기본 `hitl@askwho.net`), `HITL_GMAIL_CLIENT_ID`, `HITL_GMAIL_CLIENT_SECRET`, `HITL_GMAIL_REFRESH_TOKEN`, `HITL_MAIL_TTL_MS`(기본 1800000).

## Commands

```bash
# from repo root
npm run test:agent          # gateway(+cursor) node tests
npm test                    # backend workers + agent
npm run agent:cursor -- --config agent/cursor/reference/agents.yaml.sample --data-dir /tmp/swf-data --mock
npm run agent:gateway -- --config agent/cursor/reference/agents.yaml.sample --data-dir /tmp/swf-data/gateway

# 단일 네이티브 실행 파일 (bun build --compile; 런타임 Node 불필요)
npm run agent:gateway:build
# → agent/gateway/dist/sw-factory-gateway
# cross-compile 예: GATEWAY_COMPILE_TARGET=bun-linux-x64 npm run agent:gateway:build
./agent/gateway/dist/sw-factory-gateway --config agent/cursor/reference/agents.yaml.sample --data-dir /tmp/swf-data/gateway
```

환경: `GATEWAY_SESSION_COOKIE`, 선택 `FACTORY_BASE_URL`, `CURSOR_API_KEY`(실 SDK; 없으면/`--mock`이면 mock), HITL Gmail 변수(위).

**배포:** Docker entrypoint·macOS `run-gateway.sh`는 `sw-factory-gateway` 바이너리가 있으면 그걸 쓰고, 없으면 기존 `tsx` 경로로 폴백한다. cursor/persona seed는 Node 유지(이미지에서 Node 제거는 별 범위).
