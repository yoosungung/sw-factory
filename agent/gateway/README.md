# agent/gateway

GitHub [CursorBridge](https://github.com/yoosungung/sw-factory) (Leantime plugin) 대응.  
**역할: 티켓 이벤트를 persona agent에 prompt로 전달만 한다.**

내부 설계: [DESIGN.md](DESIGN.md) · 상세: [docs/](docs/) · 참고: [reference/](reference/)  
런타임(작업): [../cursor/](../cursor/) · 계약: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

## GitHub 대비

| GitHub CursorBridge | 이 컴포넌트 |
|---------------------|-------------|
| Leantime EventDispatcher → `POST runner_url/sessions` | Worker `agent_event_log` **pull(tail)** → localhost cursor |
| 플러그인 안 Router / SessionStore / retry | gateway 프로세스 + `/data/gateway/` |
| N개 `runner_url` | 단일 컨테이너 안 `agent/cursor` |

Worker는 내부망으로 push하지 않는다. gateway만 outbound로 log를 읽는다.

## 읽기 순서

1. [docs/01-topology.md](docs/01-topology.md)
2. [docs/02-event-log.md](docs/02-event-log.md)
3. [docs/03-routing.md](docs/03-routing.md)
4. [docs/04-dispatch-to-cursor.md](docs/04-dispatch-to-cursor.md)
5. [docs/05-backpressure.md](docs/05-backpressure.md)
6. [reference/event-log-schema.md](reference/event-log-schema.md) · [gateway-dispatch.md](reference/gateway-dispatch.md)
