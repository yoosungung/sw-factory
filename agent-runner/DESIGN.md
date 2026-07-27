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

- MVP는 **stream tool evidence** 기반이다. API read-after-write와 comment ID 반환은 다음 강화다.
- 실패 시 실패 이유와 `success_checks`를 같은 `SDKAgent`에 후속 `agent.send()`로 보낸다. `success_retry.max_attempts`(기본 3) 소진 시 `verification_failed`로 종료한다.
- stream 미지원 run은 검증을 건너뛴다(`success_check.skipped`).
- verification retry run ID는 최초 `202` accepted가 아니라 로그/`WorkerDone`에서 추적한다.
- 이 검증은 Leantime→runner 전송 장애 retry queue, worker auth-stale retry와 **의미가 다르다**.

## Run 로그 (K8s `kubectl logs`)

`/sessions/{agent_id}/prompt`는 send 직후 **202 Accepted**. run 완료는 worker/백그라운드에서 처리한다.

| `event` | 의미 |
|---------|------|
| `run.started` | `agent.send()` 직후 (accepted) |
| `run.completed` | `run.wait()` 종료 |
| `run.stream.failed` / `run.background.failed` | 스트림·백그라운드 run 중단 |
| `session.create.completed` | create 직후 첫 run 완료 |
| `worker.retired` | idle/age/jobs/auth 로 worker 폐기 |
| `worker.auth_stale.retry` | auth-stale 후 새 worker로 1회 재시도 |
| `success_check.evaluated` | 검증 판정 결과(ok·attempts·reason) |
| `success_check.retry` | 검증 실패로 같은 session 교정 send |
| `success_check.skipped` | stream 미지원 등으로 검증 생략 |

예시:

```bash
kubectl -n leantime logs -f cursor-agent-path-0 -c agent-runner | rg 'run\.(started|completed)|worker\.'
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
