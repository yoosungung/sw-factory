# Backpressure & checkpoint

단일 컨테이너에서 cursor pool이 포화될 수 있다. gateway는 **비차단 배달** + **로컬 retry**로 GH ResilientRunnerClient를 이식한다.

## 응답 처리

| cursor 응답 | gateway |
|-------------|---------|
| 202 accepted | 해당 event를 **acked**로 표시; sticky 갱신 |
| 200 create `{agent_id}` | acked; sticky 저장 |
| 409 `busy` / `skipped_mutex` | retry 큐에 보관하고 **acked는 전진**. 같은 persona의 다른 티켓이 `max_active_per_persona`까지 배달된다. hold 항목은 attempt를 올리지 않는다. |
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
- `acked_id`: cursor가 받은 구간, 또는 409 busy/mutex로 retry에 보관한 구간. 재시작 시 tail은 `acked_id` 다음부터. hold retry는 디스크에 남는다.

## Retry 큐

GH: `(ticket_id, runner_url)`당 최신 1건.  
여기: `(ticket_id, persona)`당 최신 1건 UPSERT. flush는 백그라운드 루프(수 초).

## 공정성

cursor가 persona당 active 한도를 걸면 409가 늘 수 있다. gateway는 persona별 retry가 한 봇만 스팸하지 않도록 flush 시 **라운드로빈**.
