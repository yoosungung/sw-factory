# agent_event_log schema (초안)

D1. 구현은 ROADMAP A1. `ticket_activities`와 별도.

```sql
-- agent_event_log (outbox for gateway)
id TEXT PRIMARY KEY,              -- monotonic-friendly UUID or ULID
at TEXT NOT NULL,                 -- ISO
event_type TEXT NOT NULL,         -- ticket_created|ticket_updated|ticket_deleted|comment_added|…
ticket_id TEXT,                   -- nullable for future schedule rows
project_id TEXT,
actor_user_id TEXT NOT NULL REFERENCES users(id),
assignee_user_id TEXT,            -- snapshot at event time
payload_json TEXT NOT NULL DEFAULT '{}'  -- mention user ids, changed fields, comment id, …
```

인덱스: `(at)`, `(id)` PK 순회. tail은 `WHERE id > ? ORDER BY id LIMIT n` (ULID) 또는 `(at, id)`.

## REST (Worker → gateway)

| Method | Path | 비고 |
|--------|------|------|
| GET | `/api/agent/events?after_id=&limit=` | gateway 전용. 인증: **gateway 서비스 세션** 또는 내부망 제한 + 전용 bot user. 1차는 “gateway가 로그인하는 시스템 유저”로 읽기 전용 허용을 문서화; 세부 ACL은 A1에서 확정. |
| (없음) | push webhook | 사용하지 않음 |

Worker mutate 경로에서 동기 INSERT 후 응답. gateway pull.

## payload_json 예

```json
{
  "comment_id": "…",
  "mention_user_ids": ["…"],
  "changed_fields": ["assignee_id", "status"]
}
```
