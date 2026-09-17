# Backpressure & checkpoint

단일 컨테이너에서 cursor pool이 포화될 수 있다. gateway는 **비차단 배달** + **로컬 retry**로 GH ResilientRunnerClient를 이식한다.

## 응답 처리

| cursor 응답 | gateway |
|-------------|---------|
| 202 accepted | 해당 event를 **acked**로 표시; sticky 갱신 |
| 200 create `{agent_id}` | acked; sticky 저장 |
| 409 `busy` / `skipped_mutex` | **단일 대상**이면 acked 정지 + retry 큐. **동일 이벤트 다중 대상**(assignee+@mention)에서 **한 persona라도 accept**되면 나머지는 retry에 넣고 **acked는 전진**(다른 티켓 outbox HOL 방지). |
| 409 `sdk_zombie` | sticky drop → create rebind 시도; 실패 시 retry 큐 |
| 429 `create_throttled` | retry 큐에 **넣지 않음** (GH); 로그 후 skip/ack 정책 문서화 — 기본 **ack(poison 방지)** + 구조화 로그 |
| 5xx / timeout | retry 큐; attempts < 5 |

## Checkpoint 파일

`/data/gateway/checkpoint.json`:

```json
{
  "acked_id": "…",
  "read_cursor": "…",
  "last_catch_up_at": "ISO-8601"
}
```

- `read_cursor`: 마지막으로 **읽어 본** event id (최적화).
- `acked_id`: 성공적으로 cursor에 넘긴 구간. 재시작 시 tail은 `acked_id` 다음부터(at-least-once).

## Retry 큐

GH: `(ticket_id, runner_url)`당 최신 1건.  
여기: `(ticket_id, persona)`당 최신 1건 UPSERT. flush는 백그라운드 루프(수 초).

## 공정성

cursor가 persona당 active 한도를 걸면 409가 늘 수 있다. gateway는 persona별 retry가 한 봇만 스팸하지 않도록 flush 시 **라운드로빈**.
