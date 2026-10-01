# Runner (agent-runner 이식)

Node.js 22+ · `@cursor/sdk` · Hono parent. **Parent는 SDK를 import하지 않는다.**

## 프로세스 모델

| 구성 | 역할 |
|------|------|
| parent | HTTP, 티켓 뮤텍스, persona 큐, pool lease |
| SDK worker × `pool_size` | 잡마다 create/resume → send → wait → close |

Pre-lease: idle / max-age / max-jobs 초과 worker retire. Auth 독성 시 해당 worker retire 후 1회 재시도.

## HTTP (localhost)

[../reference/runner-http.md](../reference/runner-http.md) 정본. 요약:

- `POST /sessions` → `{ agent_id }`
- `POST /sessions/{id}/prompt` → **202** accepted; **409** `skipped_active_run` (`busy`|`sdk_zombie`) / mutex
- `DELETE /sessions/{id}` → 204
- `GET /healthz` · `GET /readyz`

## Recovery (R1–R5)

GH `agent-runner` DESIGN과 동일 정신: zombie `active_run` 후 같은 티켓이 영구 409이면 안 된다.

| ID | 요지 |
|----|------|
| R1 | worker crash → release + busy clear + cancel/forget |
| R2 | active_run fail path → 동등 |
| R3 | 연속 skipped threshold → cancel/force/delete |
| R4 | 새 session create + remap |
| R5 | `session.recover` 구조화 로그 + 테스트 |

`@cursor/sdk` 핸들은 `agent.send(...)` / `agent[Symbol.asyncDispose]()`처럼 **메서드 호출로 this를 유지**한다. 함수를 꺼내 호출하면 dispose가 `awaitPendingPrAttributions` TypeError로 프로세스를 죽일 수 있다 (`wrapSdkAgent`).

**Process guard** (`process-guard.ts`, `cli` 기동 시 설치): SDK sandbox가 `spawn /bin/zsh ENOENT`처럼 uncaught ChildProcess 오류를 내면 parent HTTP가 죽지 않도록 keep-alive 로그 후 계속한다. 그 외 uncaught는 `exit(1)` (LaunchAgent/k8s가 재기동). R1–R5는 세션급; 이건 프로세스급.

gateway는 `sdk_zombie`일 때만 sticky rebind ([gateway dispatch](../../gateway/docs/04-dispatch-to-cursor.md)).

## 실행 정책 (Goose A안 축약)

optional body: `budget`, `policy`, `success_checks`, `success_retry`. soft preamble; hard turn-stop 가정 금지. success 검증의 mutation 증거는 **factory-mcp** 도구(코멘트/티켓 PATCH)로 판정.
