# agent-runner

`@cursor/sdk` TypeScript local runtime HTTP API.

Parent(Hono)는 SDK를 로드하지 않고, **worker pool** 자식 프로세스만 `@cursor/sdk`를 import한다.

## Commands

```bash
cd agent-runner
npm install
AGENT_RUNNER_MOCK=1 npm test
AGENT_RUNNER_MOCK=1 npm run dev
npm run build && npm start
```

환경 변수:

| 변수 | 기본 | 설명 |
|------|------|------|
| `AGENT_RUNNER_MOCK` | `0` | `1`이면 SDK 없이 mock 세션 |
| `CURSOR_API_KEY` | — | SDK 사용 시 필수 (worker에 env로 전달) |
| `AGENT_RUNNER_MODEL` | `composer-2.5` | 고정 모델 |
| `WORKSPACE` | `process.cwd()` | local agent `cwd` |
| `PORT` | `8080` | HTTP 포트 |
| `AGENT_RUNNER_POOL_SIZE` | `2` | SDK worker 프로세스 수 |
| `AGENT_RUNNER_WORKER_IDLE_MS` | `660000` (11분) | lease 전 idle 초과 시 worker 교체 |
| `AGENT_RUNNER_WORKER_MAX_AGE_MS` | `2700000` (45분) | lease 전 age 초과 시 worker 교체 |
| `AGENT_RUNNER_WORKER_MAX_JOBS` | `50` | lease 전 job 수 초과 시 worker 교체 |
| `KUBERNETES_NAMESPACE` | `leantime` | kubectl 기본 namespace (K8s Pod) |
| `GH_TOKEN` | — | **봇 runner 필수** — GitHub PAT (repo write). Secret 기본 키 `GH_TOKEN` |
| `GH_TOKEN_OVERRIDE` | — | 선택. Secret `GH_TOKEN_{name}`이 있으면 entrypoint가 `GH_TOKEN`을 이 값으로 대체 |

Node.js **22.13+** 필요 (`@cursor/sdk` 요구사항).

## Worker pool

| 구성 | 역할 |
|------|------|
| parent (`dist/server.js`) | HTTP·티켓 뮤텍스·pool 디스패치. `@cursor/sdk` 미import |
Worker: 잡마다 `create`/`resume` → `send` → `wait` → `close`. **handle 장기 캐시 없음**. `Agent.resume`에도 `local.settingSources: ["user","project"]`를 다시 넘긴다(SDK는 resume 시 MCP/settings를 유지하지 않음).

Pre-lease: idle / max-age / max-jobs 초과 worker는 잡 할당 전에 retire·spawn.

Auth 독성(in-band `Authentication error…`): 해당 worker retire 후 **같은 잡 1회** 재시도. `Cursor.me` probe는 쓰지 않음.

## 실행 정책 (Goose A안)

HTTP 계약(`POST /sessions`, `202` prompt, ticket↔session)은 유지한다. optional body 필드만 확장한다.

| 필드 | 의미 | 적용 |
|------|------|------|
| `budget.max_turns` | 사용자 입력 없이 진행할 권장 turn 상한 | prompt preamble |
| `budget.timeout_ms` | run 권장 시간 상한(정보성) | prompt preamble + logs |
| `policy.tool_classes` | read / local_write / external_write / destructive 안내 | prompt preamble |
| `policy.deny` | 금지 항목 목록(예: force-push) | prompt preamble |
| `context_summary` | 이전 작업 요약(agent-visible 보조) | prompt 앞단 |
| `success_checks` | 완료 검증 기준(자연어) — verification 활성화 신호 | 검증·재시도 prompt |
| `success_retry.max_attempts` | 검증 실패 시 같은 session 교정 send 상한(기본 3) | verification 루프 |

- `budget` = 얼마나 할 수 있나. `policy` = 무엇을 해도 되나.
- Cursor SDK local이 hard turn-stop을 항상 보장한다고 가정하지 않는다. preamble은 soft budget이다.
- prompt-only deny는 강제 보안 장치가 아니다. Pod/MCP에서의 destructive 차단은 장기 과제다.
- 구현: `src/run-policy.ts` → `composeAgentPrompt`, worker `execute-job.ts`가 send 전에 적용. 로그는 `run-logger.ts`.

### Success 검증 (Phase 2)

`success_checks`가 있는 run만 hard 판정한다. 판정식은 **AND**다:

1. SDK `RunResult.status === "finished"` (agent가 출력하는 `exit=0` 텍스트는 신뢰하지 않는다).
2. run의 **마지막 완료 tool_call**이 성공한 Leantime mutation이다.
   - 허용 목록: `add_comment`(module=ticket, module_id=active), `update_ticket`(ticket_id=active), ticket 없는 schedule의 `create_ticket`.
   - tool 이름은 접미사 매칭으로 정규화(`*_add_comment` 등)한다. `status=error`나 명백한 실패 결과(`false`)는 거부한다.
   - SDK/`CallMcpTool` 래퍼(`name`이 `mcp` 또는 `CallMcpTool`)는 `args.toolName`과 nested `args`/`arguments`로 풀어 mutation·대상을 판정한다.
   - 조회 tool, 대상 ticket을 증명 못 하는 comment 수정/삭제는 성공 증거로 쓰지 않는다.
3. last-tool이 실패해도 **API read-after-write**(`LEANTIME_URL`+`LEANTIME_ACCESS_TOKEN` JSON-RPC `Comments.getComments`)로 Active ticket에 최근 코멘트가 보이면 `ok_read_after_write`로 통과한다.

- 실패 시 실패 이유와 `success_checks`를 같은 `SDKAgent`에 후속 `agent.send()`로 보낸다. `success_retry.max_attempts`(기본 **1**) 소진 시 `verification_failed`로 종료한다.
- **인프라 실패**(MCP sticky/discovery/`tool_error:mcp` 등, 또는 shell last-tool이지만 같은 run에서 MCP mutation이 이미 실패한 경우)는 재시도하지 않고 `success_check.infra_abort` 후 종료한다. `WorkerDone.mcpStickyReset`으로 ticket→agent 매핑을 지워 다음 dispatch가 새 session을 만든다(`mcp.sticky_reset`).
- 같은 `reason`이 직전 실패와 동일하면 `success_check.same_reason_stop`으로 즉시 중단한다(Outcome 스팸 방지).
- retry prompt는 “이미 write 했으면 재작성 금지”를 명시한다.
- stream 미지원 run은 검증을 건너뛴다(`success_check.skipped`).
- verification retry run ID는 최초 `202` accepted가 아니라 로그/`WorkerDone`에서 추적한다.
- 이 검증은 Leantime→runner 전송 장애 retry queue, worker auth-stale retry와 **의미가 다르다**.

### Create storm 차단

ticket_id당 2분 창에서 create가 5회 쌓였는데 run 완료(`session.create.completed`)가 없으면 이후 create는 **429 `create_throttled`**. Bridge는 이 응답을 retry queue에 넣지 않는다.

### MCP readiness

`GET /readyz`는 `import mcp, fastmcp, leantime_mcp` 스모크(실패 시 503). `AGENT_RUNNER_MOCK=1` / `AGENT_RUNNER_SKIP_MCP_READY=1`이면 skip. StatefulSet readinessProbe는 `/readyz`.

## Recovery (zombie `active_run`)

증상: worker 비정상 종료·미정리 후 parent `busyAgents`는 풀려도 SDK local agent에 active run이 남아, 이후 `POST …/prompt`(또는 create→기존 매핑 prompt)가 409 `skipped_active_run` / `session.prompt.skipped` `reason=active_run`으로 **영구 고착**한다. soft budget·pre-lease·PM `@mention`만으로는 풀리지 않는다.

**HTTP 계약 불변** (ARCHITECTURE §2.3.1): `202` accepted, 409 `skipped_active_run` / `skipped_mutex` 의미·상태 코드 변경 없음. Recovery는 parent(session-manager / pool) 내부 동작이다.

**Non-goals:** Bridge retry queue 전면 재설계; `budget.timeout_ms`를 hard kill로 바꾸기(기본 soft 유지; optional hard는 별도); 테넌트 제품 EX.

| ID | 트리거 | 동작 | `session.recover` |
|----|--------|------|-------------------|
| **R1** | Run 중 worker crash / unexpected exit | pool slot release + `busyAgents` clear + 해당 ticket↔agent 매핑 **forget** | `reason=worker_crash`, `action=forget` |
| **R2** | `WorkerDone` reject / `active_run` fail path (SDK `already has active run` 등) | R1과 동일 release+forget. `mcpStickyReset`만으로 끝내지 않음; cancel 가능 시 best-effort `DELETE` | `reason=active_run_fail` 또는 `done_reject` |
| **R3** | 동일 agent/ticket에 **연속** `skipped_active_run` (기본 threshold **2**) | cancel/force 시도: SDK `run.cancel` / `Agent.cancelRun` 가능 시 사용, 아니면 `DELETE /sessions/{id}`(=`backend.cancel`) + forget | `reason=skipped_threshold`, `action=cancel\|force\|delete` |
| **R4** | R3 cancel/force 후, 또는 매핑이 비어 다음 prompt가 필요할 때 | **새 session create** + ticket↔agent remap | `reason=recreate`, `action=recreate` |
| **R5** | 모든 recovery 경로 | 구조화 로그 `session.recover` (`reason`, `agent_id`, `ticket_id?`, `action` ∈ `forget`\|`cancel`\|`force`\|`delete`\|`recreate`) + `AGENT_RUNNER_MOCK=1 npm test`에서 R1–R4 단위 테스트 green | (로그 자체) |

- Pool: accept 이후 `done` reject 시에도 worker slot `release`(leak 방지).
- 연속 skip threshold=2는 운영 기본값. 변경은 티켓 코멘트로만(코드 기본 상수; Eric 불필요).
- cancel/recreate는 해당 티켓의 이전 SDK transcript를 잃을 수 있다(zombie 해제 우선). `local.force`로 transcript를 보존하는 경로는 optional이며 R3의 cancel/delete와 동등 취급하지 않는다.
- 구현·테스트는 후속 서브태스크(#200); 본 절이 R1–R5 정본 AC다.

## Run 로그 (K8s `kubectl logs`)

`/sessions/{agent_id}/prompt`는 send 직후 **202 Accepted**. run 완료는 worker/백그라운드에서 처리한다.

| `event` | 의미 |
|---------|------|
| `run.started` | `agent.send()` 직후 (accepted) |
| `run.completed` | `run.wait()` 종료 |
| `run.stream.failed` / `run.background.failed` | 스트림·백그라운드 run 중단 |
| `session.create.completed` | create 직후 첫 run 완료 |
| `session.create.throttled` | create storm circuit breaker |
| `worker.retired` | idle/age/jobs/auth 로 worker 폐기 |
| `worker.auth_stale.retry` | auth-stale 후 새 worker로 1회 재시도 |
| `success_check.evaluated` | 검증 판정 결과(ok·attempts·reason) |
| `success_check.retry` | 검증 실패로 같은 session 교정 send |
| `success_check.infra_abort` | MCP/인프라 실패로 재시도 중단 |
| `success_check.same_reason_stop` | 동일 reason 연속 실패로 중단 |
| `success_check.skipped` | stream 미지원 등으로 검증 생략 |
| `mcp.sticky_reset` | ticket agent 매핑 삭제(다음 create가 새 MCP host) |
| `session.recover` | zombie/`active_run` recovery (§ Recovery R1–R5: `reason`·`action`) |

예시:

```bash
kubectl -n sw-factory logs -f cursor-agent-path-0 -c agent-runner | rg 'run\.(started|completed)|worker\.'
```

긴 텍스트·도구 결과는 500자에서 잘린다 (`run-logger.ts`).

## 컨테이너 도구 (K8s Pod)

| 도구 | 용도 |
|------|------|
| Python **3.12** + **uv** | `leantime-mcp` 테스트 |
| **kubectl** | in-cluster 로그·Pod 상태 |
| **gh** | PR/릴리스 |
| **git** | 워크스페이스 저장소 작업 |

```bash
docker build -f agent-runner/Dockerfile -t cursor-agent-runner .
```
