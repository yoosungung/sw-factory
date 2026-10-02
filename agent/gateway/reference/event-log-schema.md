# agent_event_log schema

D1. `ticket_activities`와 별도. 구현: ROADMAP A1.

```sql
-- agent_event_log (outbox for gateway)
id TEXT PRIMARY KEY,              -- UUID (도메인과 동일)
at TEXT NOT NULL,                 -- ISO
event_type TEXT NOT NULL,         -- ticket_created|ticket_updated|ticket_deleted|comment_added|manual_prompt
ticket_id TEXT,                   -- FK 없음 (delete 후에도 잔존); manual_prompt는 optional
project_id TEXT,
actor_user_id TEXT NOT NULL REFERENCES users(id),
assignee_user_id TEXT,            -- snapshot at event time; manual_prompt = resolved target
payload_json TEXT NOT NULL DEFAULT '{}'  -- mention user ids, changed fields, comment id, prompt, …
```

인덱스: `(at)`, PK `(id)`.  
tail: `after_id` 행의 `(at, id)`를 앵커로 `WHERE (at > ? OR (at = ? AND id > ?)) ORDER BY at ASC, id ASC LIMIT n`.

## REST (Worker → gateway)

| Method | Path | 비고 |
|--------|------|------|
| GET | `/api/agent/events?after_id=&limit=` | 세션 쿠키 필수. A1 ACL: **로그인 유저면 전체 outbox 읽기 허용**(gateway가 전용 시스템 유저로 로그인하는 전제; 내부망 배포). `after_id`가 없으면 처음부터; 있으면 해당 id 미존재 시 `400 invalid_after_id`. |
| POST | `/api/agent/prompts` | 세션 필수. body `{ project_id, target, prompt, ticket_id? }` → `manual_prompt` append. 계약: [ARCHITECTURE.md](../../../ARCHITECTURE.md) §4 Agent outbox. |
| (없음) | push webhook | 사용하지 않음 |

Worker mutate 경로·`POST /api/agent/prompts`에서 동기 INSERT 후 응답. gateway pull.

## payload_json 예

```json
{
  "comment_id": "…",
  "mention_user_ids": ["…"],
  "changed_fields": ["assignee_id", "status"],
  "dependency_cleared": true,
  "unblocked_from": ["blocker-ticket-id"],
  "prompt": "…",
  "target": "sw-factory",
  "target_user_id": "…"
}
```

FS auto-unblock은 전용 `event_type` 없이 `ticket_updated` + 위 payload 필드를 쓴다(gateway 라우팅 변경 없음).

`manual_prompt`는 `prompt`·`target`·`target_user_id`를 쓴다. gateway는 schedule/`catch_up`과 같이 `deliverTicketless`로 배달한다(`ticket_id` 있으면 Active 스코프 `deliverOne`). `ticket_id` 없으면 티켓리스(회신 SoR = PVC/로그).
