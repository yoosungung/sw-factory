# agent_event_log

Worker가 티켓 도메인 mutate 시 append하는 **outbox**. gateway의 유일한 입력이다.

`ticket_activities`(필드 변경 이력)와 **분리**한다. UI History는 activities; agent wake는 event log.

## 누가 쓰는가

| 주체 | 동작 |
|------|------|
| Worker | INSERT only (티켓/코멘트/assignee 등) |
| gateway | `GET …?after_id=` tail; **acked_id**는 gateway 로컬(`/data/gateway/checkpoint.json`) |
| cursor | 읽지 않음 |

## 이벤트 종류

| `event_type` | 트리거 (Worker) | gateway 기본 라우팅 |
|--------------|-----------------|---------------------|
| `ticket_created` | POST ticket | assignee agent; 없으면 unassigned→pm triage 멘션 정책(후속) |
| `ticket_updated` | PATCH ticket (필드 변경 시) | assignee; assignee 변경 시 handoff |
| `ticket_deleted` | DELETE ticket | sticky session delete 힌트만 (작업 없음) |
| `comment_added` | POST comment | assignee + @mention targets |
| `catch_up` | (log 아님) gateway 기동 | 티켓리스 prompt — [03-routing](03-routing.md) |

스키마·REST: [../reference/event-log-schema.md](../reference/event-log-schema.md).

## Tail 규칙

1. `read_cursor`로 배치를 읽어도 **acked_id**는 202 accept 전에는 올리지 않는다 ([05-backpressure](05-backpressure.md)).
2. at-least-once: 재시작 시 미ack 구간 재배달 가능 → cursor prompt는 멱등·debounce와 맞춘다.
3. debounce: 동일 `(ticket_id, target_persona)` 창 안 이벤트는 최신 1건으로 병합(`debounce_ms`).
