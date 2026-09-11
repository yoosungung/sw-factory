# Runner HTTP (localhost)

Binding: `127.0.0.1:8080` (설정). 클러스터 외부에 Service로 노출하지 않는다.

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/sessions` | `{ prompt, ticket_id?, persona, event?, budget?, policy?, success_checks? }` | `200 { agent_id }` |
| POST | `/sessions/{agent_id}/prompt` | `{ prompt, ticket_id?, event?, … }` | `202 { run_id, status: "accepted" }` |
| | | | `409 { status: "skipped_active_run", reason: "busy"\|"sdk_zombie" }` |
| | | | `409 { status: "skipped_mutex" }` |
| | | | `429 { status: "create_throttled" }` (create 경로) |
| DELETE | `/sessions/{agent_id}` | — | `204` |
| GET | `/healthz` | — | `200` |
| GET | `/readyz` | — | `200` / `503` (MCP smoke) |

`persona`로 cwd=`/data/workspaces/{persona}` 선택. parent는 SDK 미로드.
