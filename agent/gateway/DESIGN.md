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

## Layout

```
agent/gateway/
  README.md
  DESIGN.md
  docs/
  reference/
  src/          # A2: tail · router · prompts · dispatch · retry · loop
  tests/        # mock cursor E2E
```

## 내부 모듈

| 모듈 | 대응 (GH) | 책임 |
|------|-----------|------|
| `tail` | Listener + tick | Worker `GET /api/agent/events?after_id=` |
| `router` | Router | 대상 persona, self-echo skip, mention |
| `prompts` | `bridge.json` prompts | 이벤트 타입별 템플릿 + Active ticket 스코프 |
| `dispatch` | RunnerClient | cursor `POST /sessions` · `/prompt` (localhost) |
| `retry` | ResilientRunnerClient | 409/5xx → `/data/gateway/retry/` 큐 |
| `checkpoint` | SQLite sessions/ready | `acked_id`만 전진 (202/200 accept 후) |
| `loop` | tick | pull → route → dispatch → checkpoint |

## Commands

```bash
# from repo root
npm run test:agent          # gateway(+cursor) node tests
npm test                    # backend workers + agent
```
