# Dispatch to cursor

gateway → cursor는 **localhost**만. 페이로드는 prompt 배달에 필요한 최소 필드.

## 호출

| 상황 | cursor API |
|------|------------|
| 티켓에 sticky session 없음 | `POST /sessions` `{ prompt, ticket_id?, persona, event }` → `agent_id` |
| sticky 있음 | `POST /sessions/{agent_id}/prompt` `{ prompt, ticket_id?, event }` → **202** |
| 티켓 삭제 / 강제 종료 | `DELETE /sessions/{agent_id}` |
| 준비 | `GET /readyz` (로컬; MCP smoke) · `GET /healthz` |

상세 dialect: [../../cursor/reference/runner-http.md](../../cursor/reference/runner-http.md).

## Sticky

ticket↔`agent_id` 매핑은 **cursor**가 보관(GH plugin SQLite의 로컬 대응). gateway는 응답의 `agent_id`를 기억해 다음 prompt에 쓸 수 있으나, 정본 매핑은 cursor.

**rebind:** prompt가 `404` 또는 `409` + `reason=sdk_zombie`이면 sticky 폐기 후 `POST /sessions`로 재생성(GH `promptOrRebind`). `reason=busy`·`mutex`는 sticky 유지 + retry 큐.

## 금지

- dispatch 경로에서 Worker REST로 코멘트/티켓 쓰기
- cursor 응답을 기다며 run 완료까지 블록 (202만 대기; curl short timeout)
