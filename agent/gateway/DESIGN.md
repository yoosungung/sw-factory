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

## Layout (목표)

```
agent/gateway/
  README.md
  DESIGN.md
  docs/
  reference/
  src/          # 구현 후속 (A2)
```

## 내부 모듈 (설계)

| 모듈 | 대응 (GH) | 책임 |
|------|-----------|------|
| `tail` | Listener + tick | Worker `GET /api/agent/events?after_id=` |
| `router` | Router | 대상 persona, self-echo skip, mention |
| `prompts` | `bridge.json` prompts | 이벤트 타입별 템플릿 + Active ticket 스코프 |
| `dispatch` | RunnerClient | cursor `POST /sessions` · `/prompt` (localhost) |
| `retry` | ResilientRunnerClient | 409/5xx → `/data/gateway/` 큐 |
| `checkpoint` | SQLite sessions/ready | `acked_id`만 전진 (202 accept 후) |

## Commands

코드 없음. 구현 마일스톤(A2)에서 채운다.
