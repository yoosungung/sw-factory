# ARCHITECTURE.md

Leantime × Cursor Agent 협업 시스템 계약 및 인터페이스.

## 0. Framework vs Tenant

| | **Agent Framework (이 저장소)** | **Tenant project (외부 repo)** |
|--|--------------------------------|-------------------------------|
| 역할 | 설치형 공장: Bridge, runner, persona, **운영 SW CD 메커니즘** | 개발·운영되는 앱/서비스 **소스·이미지·도메인 설정** |
| 코드 | 공장 코드만 | `repos[].git_repo_url`이 가리키는 제품 소스만 |
| CD | 프레임워크가 해결(dispatch·rollout·smoke·Done 게이트) | CD *대상* + 워크플로/매니페스트/값(`examples/tenant-cd` 어댑터 복사) |

제품 비즈니스 소스를 이 저장소에 두지 않는다. 운영 SW CD는 공장 범위다. E2E 시나리오·보안/클린/부하/대량품질 기준·Opik 설정은 **고객사(client) repo** 정본이며 공장에 복사하지 않는다(`examples/tenant-cd/`, `examples/tenant-quality/` 어댑터만).

## 1. 계약사항 (불변 규칙)

1. **Cloud Agent 미사용** — `type: sessions` 계정은 SDK `local` runtime만 사용한다. `type: openai`는 외부 OpenAI-compatible API(예: Hermes)다.
2. **별도 Bridge 서비스 없음** — 오케스트레이션은 Leantime `CursorBridge` 플러그인이 담당한다.
3. **티켓 ↔ session/conversation 1:1** — `ticket_id`마다 고유 `agent_id` 하나; 플러그인 DB가 포인터를 보관한다. `sessions`는 Cursor `agent_id`, `openai`는 named `conversation`(`leantime-ticket-{id}`).
4. **Leantime 계정 ↔ runner 1:1** — 최대 10 agent; `bridge.json` / `agents.yaml`이 정본이다. `sessions`는 `cursor-agent-{name}` Pod(+PVC), `openai`는 외부 `runner_url`.
5. **이벤트 기반 실행** — runner에 inference를 요청하는 wake는 다음뿐이다: (1) Leantime 이벤트, (2) 플러그인 `schedules[]` 틱, (3) **runner Ready-edge catch-up**(재기동=출근). 모두 CursorBridge가 오케스트레이션하며 runner는 자체 cron하지 않는다. Ready catch-up은 `schedules[]` 항목이 아니라 Ready 전이(false→true)가 트리거다(§2.4.2).
6. **자기 반향(self-echo) 억제** — `type`이 `human`이 아닌 에이전트가 **자기 담당 티켓**에 낸 이벤트만 담당 runner 디스패치를 생략한다. 다른 에이전트·인간이 낸 이벤트(에이전트 간 코멘트 포함)는 정상 라우팅한다.
7. **읽기 우선** — 에이전트는 Leantime MCP로 `get_ticket` / `get_comments` 후 행동한다.
8. **K8s namespace** — `sw-factory` (Leantime과 동일 NS; 레거시 `leantime` NS는 SETUP 참고).
9. **모델** — `deploy/k8s/agents.yaml` 정본: `settings.model` 기본값, bot마다 `agents[].model`로 override. Pod `AGENT_RUNNER_MODEL`에 주입; 기본 `composer-2.5` (비용 예측 가능); `auto`는 선택 사항.
10. **Tenant CD ≡ Client** — 테넌트 신원은 Leantime **`client_id`(1:1)**. `repos[].tenant_cd`는 그 client 소속 repo의 CD 블록이다. 배포는 공장(TA/ta `tenant-cd`)이 수행한다. v1 드라이버는 `workflow_dispatch`만. 상세는 §2.8.
11. **Dual-loop factory** — 공장 직원 5인(PM=`pm`, KM=`km`, TA=`ta`, QA, AA)은 **client에 묶이지 않고** 전 고객사에 접근한다. 개발자는 `human` 또는 `sessions`로 client/repo에 귀속 가능. **기능 루프**(티켓): 구현→test 배포→QA(E2E)∥AA(보안)→prod 배포→Done. **비기능 루프**(주간): TA 부하·AA 클린코드·QA 대량품질 → 해당 client 프로젝트에 티켓. 상세는 §2.6.
12. **품질 기준은 고객사 repo** — E2E·보안·클린코드·부하·bulk/Opik 본문은 테넌트 `.factory/quality.yaml`(또는 동등)과 repo 산출물. 공장은 스킬·증거 스키마·스케줄·`tenant-repo-sync`(최신 checkout)만.

## 2. 컴포넌트 간 인터페이스

### 2.1 bridge.json (정적)

경로: `leantime-plugin/bridge.json`

| 필드 | 타입 | 설명 |
|------|------|------|
| `agents[]` | array | ≤10; `name`, `leantime_user_id`, `email`, `runner_url`, `git_repo_url`(sync가 `primary_repo` resolve), `persona`, `type`(`human`\|`sessions`\|`openai`). `human`: Pod 없음·`runner_url` 빈 문자열. `sessions`: Pod/Service `cursor-agent-{name}`, sync가 runner_url 생성, `model`(선택), `gh_token_secret_key`(선택, 기본 `GH_TOKEN`). `openai`: YAML `runner_url` 필수(외부 OpenAI-compatible), StatefulSet 없음. `tenant_cd`는 **bridge.json에 넣지 않음** — ta `tenant-cd-registry.json`만(§2.8). 주간 NF용 `clients-repos-registry.json`은 qa/aa/ta에 시드(§2.8) |
| `model` | string | 기본 모델 (`agents.yaml` `settings.model`에서 sync; `sessions`별 override는 `agents[].model`) |
| `debounce_ms` | int | 동일 티켓 이벤트 디바운스 |
| `prompts` | object | `ticket_created`, `ticket_updated`, `comment_added`, `assignee_changed`, `mention` (`{ticket_id}`), `handoff`, `catch_up`(티켓리스; `{lookback_since}`). Router가 **이벤트** 프롬프트에만 `Active ticket_id=N` 스코프 문장을 붙여 MCP 읽기/쓰기를 그 티켓으로 고정한다. `catch_up`·`schedules[]` 세션에는 Active-ticket 스코프를 붙이지 않는다. |
| `status_prompts` | object | 상태별 추가 프롬프트 (M3) |
| `mention_routing` | bool | Tiptap `data-tagged-user-id` 또는 `@email` 멘션 시 해당 runner 알림 (M3) |
| `schedules[]` | array | 주기 프롬프트. `id`, `cron`(5필드·UTC), `prompt` 필수; `agents`(name 목록) 생략 시 `type != human`이고 `runner_url` 비어 있지 않은 전원. 선택 `gates`(string 배열, **생략/`[]` = 무조건 발사**): 나열된 게이트를 **AND**로 만족할 때만 세션 생성. 지원 `in_progress`(status=4), `flow_active`(In Progress·Review·Deploying Test·QA·Deploying Prod = 4/10/11/12/13, 공장 기본 status_board id). 미지원 게이트는 발사하지 않음(fail-closed). 정본은 `deploy/k8s/agents.yaml` `settings.schedules` → sync |

### 2.2 플러그인 DB — `cursorbridge_sessions`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `ticket_id` | int PK | Leantime ticket |
| `agent_id` | string | Cursor local session id |
| `assignee_user_id` | int | 현재 담당 Leantime user |
| `updated_at` | datetime | |

### 2.2.1 플러그인 DB — `cursorbridge_retry_queue`

runner 일시 장애 시 Leantime 요청은 실패하지 않고, **티켓×계정(runner_url)당 최신 1건**만 보관한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `ticket_id` | int | Leantime ticket (PK 일부) |
| `runner_url` | string | agent 계정 runner (PK 일부) |
| `method` | string | `create` \| `prompt` \| `delete` |
| `body_json` | string | 재시도 payload |
| `attempts` | int | flush 실패 횟수 (`< 5`만 재시도) |
| `created_at` / `updated_at` | datetime | |

규칙:

- 동일 `(ticket_id, runner_url)` 재실패 → **UPSERT**(최신 prompt/event로 덮어씀, `attempts` 리셋).
- 동일 `(ticket_id, runner_url)` runner 호출 **성공** → 해당 행 **삭제**(이후 이벤트가 이미 처리됨).
- `@mention`·핸드오프로 **다른 runner**가 같은 티켓에 디스패치되면 runner별로 별도 행.

### 2.2.2 플러그인 DB — `cursorbridge_runner_ready` / `cursorbridge_catch_up_fires`

| 테이블 | 용도 |
|--------|------|
| `cursorbridge_runner_ready` | `runner_url` PK; `is_ready`, `ready_since`, `last_catch_up_at`, `updated_at` |
| `cursorbridge_catch_up_fires` | `(runner_url, epoch)` PK — Ready epoch당 catch-up 1회 claim |

### 2.3 Runner HTTP dialect

플러그인은 `agents[].type`으로 dialect를 고른다.

#### 2.3.1 `sessions` (agent-runner)

구현 스택: Node.js 22+ · `@cursor/sdk` · Hono.

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/sessions` | `{prompt, ticket_id?}` | `{agent_id}` — run은 백그라운드 |
| POST | `/sessions/{agent_id}/prompt` | `{prompt, event?, ticket_id?}` | **202** `{run_id, status: "accepted"}` — run 완료까지 Leantime을 블록하지 않음 |
| DELETE | `/sessions/{agent_id}` | — | 204 |
| GET | `/healthz` | — | 200 |

HTTP 계약은 불변(409 `skipped_active_run` 포함). 프로세스 내부는 **parent(Hono, SDK 미로드) + SDK worker pool**: 잡마다 worker가 `create`/`resume` → `send` → `wait` → handle `close`. Pre-lease로 idle/age/jobs 초과 worker를 교체하고, in-band auth 독성 시 해당 worker만 retire 후 1회 재시도한다. Worker crash·SDK zombie `active_run` 복구(매핑 forget·cancel·새 session·`session.recover` 로그)는 runner 내부이며 HTTP dialect를 바꾸지 않는다 — 정본 [`agent-runner/DESIGN.md`](agent-runner/DESIGN.md) § Recovery.

**Run 실패 복구 (계약):** worker crash·`session.create.failed` / `run.background.failed` / SDK `active_run` zombie 후 **같은 ticket에 대한 후속 prompt가 영구 `skipped_active_run`이면 안 된다.** runner는 ticket↔agent 매핑을 끊고(필요 시 session cancel/`local.force`) **새 session으로 재부착**해야 한다. `budget.timeout_ms`는 soft preamble일 뿐 hard kill이 아니다. 내부 AC·로그 이벤트는 [`agent-runner/DESIGN.md`](agent-runner/DESIGN.md) § Recovery.

#### 2.3.2 `openai` (OpenAI-compatible, 예: Hermes API Server)

| Method | Path | Body | 동작 |
|--------|------|------|------|
| POST | `/v1/responses` | `{input, conversation, store: true}` | `conversation` = `leantime-ticket-{ticket_id}` (티켓 없음이면 일회 id). Bearer `CURSORBRIDGE_OPENAI_API_KEY`. 플러그인은 **fire-and-forget**(짧은 대기 후 수락)으로 Leantime을 블록하지 않음 |
| DELETE | — | — | no-op |

`agent_id` 포인터는 named `conversation` 문자열이다.

### 2.4 Leantime EventDispatcher 훅

| 이벤트 | 훅 패턴 |
|--------|---------|
| ticket created | `leantime.domain.tickets.services.tickets.*.ticket_created` (legacy; case-sensitive) |
| ticket updated | `leantime.domain.tickets.services.tickets.*.ticket_updated` |
| ticket deleted | `leantime.domain.tickets.services.tickets.*.ticket_deleted` |
| comment added | `leantime.domain.projects.services.projects.notifyProjectUsers.notifyProjectUsers` (`module=comments`) |

### 2.4.1 schedules 틱

K8s CronJob `cursorbridge-schedule-tick`(* * * * *, UTC)이 Leantime Pod에서 `bin/tick-schedules.php`를 실행한다. due인 `schedules[]`마다 `gates`를 평가한 뒤(생략 시 통과), 대상 bot에 **티켓 없는 신규 세션**을 `POST /sessions`으로 만든다(프롬프트만; 에이전트가 MCP로 열린 티켓을 찾음). `cursorbridge_sessions`에는 올리지 않는다. 동일 `(schedule_id, YYYY-MM-DDTHH:MM)`는 한 번만 발사(SQLite dedupe).

### 2.4.2 Ready-edge catch-up (재기동 = 출근)

같은 CronJob이 `tick-schedules.php`에서 **Ready catch-up**도 돌린다(새 `schedules[]` 항목 아님).

| 단계 | 동작 |
|------|------|
| 프로브 | 각 `type != human`·`runner_url` 비어 있지 않은 bot에 `GET {runner_url}/readyz` → 실패 시 `/healthz`. HTTP 2xx면 Ready. |
| 스냅샷 | SQLite `cursorbridge_runner_ready`에 runner별 `is_ready`·`ready_since`·`last_catch_up_at` 보관. |
| 전이 | **false→true** 또는 **unknown→true**일 때만 catch-up. 연속 Ready는 no-op. Ready가 false로 떨어진 뒤 다시 true면 새 출근. |
| 발사 | `prompts.catch_up`으로 **티켓 없는** `POST /sessions` 1회. `cursorbridge_sessions` 미등록. 동일 Ready epoch당 1회(SQLite `cursorbridge_catch_up_fires` claim). |
| lookback | 프롬프트 `{lookback_since}` = 직전 `last_catch_up_at`, 없으면 지금−48h(ISO). |

에이전트는 MCP로 배정함·멘션을 훑고 **한 건**을 골라 그 세션에서 착수한다(persona `agent-catch-up`). 실패 디스패치 재전송(`flush-retries`)과 별개다. DB 스키마는 §2.2.2.

### 2.5 Persona 번들 (`deploy/personas/_default/` + `deploy/personas/{persona}/`)

`render-agents.sh`가 `_default/`와 persona 오버레이를 병합해 ConfigMap `persona-{persona}`를 생성한다.

| 파일 | PVC 대상 | 병합 |
|------|----------|------|
| `mcp.json` | `~/.cursor/mcp.json` | `mcpServers` deep merge (persona가 서버명 단위 override) |
| `MEMORY.md` | `~/.cursor/MEMORY.md` | `_default` + persona append; **seed-once**(파일 없을 때만 시드, PVC 유지) |
| `skills/**` | `~/.cursor/skills/**` | 번들 내 `.cursor/skills/` — 경로별 overlay (persona wins) |
| `rules/**` | `~/.cursor/rules/**` | 번들 내 `.cursor/rules/` — 경로별 overlay (persona wins) |
| `cli-config.json` | `~/.cursor/cli-config.json` (선택) | persona 파일이 있으면 대체, 없으면 `_default` |

### 2.6 에이전트 협업 프로토콜 (Dual-loop)

**역할 매핑:** PM=`pm` · KM=`km` · TA=`ta` · QA=`qa` · AA=`aa`. 직원 5인은 `agents[].client_id` 없음(전 client 공용).

**고객사 Project 상태 보드** (이름 고정; numeric id는 `clients[].status_map` / `settings.status_board`):

| 이름 | 구간 | 담당 |
|------|------|------|
| `New` | Intake | PM |
| `In Progress` | 로컬 구현 | 개발자 |
| `Review` | PR 리뷰·머지 | PM |
| `Deploying Test` | test env CD | TA |
| `QA` | E2E ∥ AA 보안 | QA / AA |
| `Deploying Prod` | 운영 CD | TA |
| `Done` | 운영 반영 완료 | PM 게이트 |
| `Blocked` | 막힘 | PM |
| `Waiting for Approval` | 사람 결정 | human |

1. MCP 읽기 우선 — **이벤트** 프롬프트의 `Active ticket_id`만 범위. **예외:** Ready catch-up·`schedules[]` 티켓리스 세션에는 Active-ticket 스코프가 없다. catch-up은 배정/멘션 triage 후 **한 건**을 골라 그 세션에서 MCP로 읽고 쓰며, 이후 해당 티켓 이벤트는 기존 티켓 바인딩 세션으로 라우팅한다.
2. 쓰기는 `add_comment` 우선 — 이벤트 세션의 `module_id`는 Active ticket_id. catch-up·스케줄 세션은 선정한 티켓 id.
3. **기능 루프 (CD 대상):** `In Progress` → `Review`(PM merge) → `Deploying Test`(TA) → `QA`(QA E2E ∥ AA 보안) → 둘 다 통과 후 `Deploying Prod`(TA) → 증거 충족 시 `Done`. 실패 시 개발자·`In Progress`/`Blocked`. `tenant_cd` 없으면 Review → Done(기존).
4. **리뷰 핸드오프 전 배송(ship) 필수** — 봇 runner는 `git-ship`으로 push·PR 후 Review·`@pm`. 사람에게 로컬 push를 요청하지 않는다.
5. 핸드오프: assignee + 같은 티켓 코멘트. merge 후 CD면 TA에 `merge_sha`; test 성공 후 `@qa` `@aa`; 게이트 통과 후 TA에 prod.
6. `@mention` 시 해당 runner 알림 (M3). **티켓 생성 시 담당자(editor)가 비어 있으면** CursorBridge가 `@pm` triage 멘션 코멘트를 1회 남기고 기존 mention 라우팅으로 pm 세션을 연다(pm에 직접 createSession하지 않음; `ticket_updated`는 대상 아님).
7. 에이전트 간 코멘트 허용; 자기 담당 자기 코멘트 self-echo만 억제.
8. `GH_TOKEN`·push 실패 시 blocker + `@eric` — 사용자 로컬 push 요청 금지.
9. **Done 게이트 (CD):** §2.8 기능 증거(test + `qa:` + `aa:` + prod) 전부. merge ≠ Done. 부하·클린코드는 티켓 Done 불필요(주간 NF).
10. **비기능 루프 (주간):** 스케줄 `ta-load-weekly` / `aa-clean-weekly` / `qa-bulk-weekly` — **먼저** `tenant-repo-sync`로 `clients-repos-registry.json`의 각 제품 repo를 ephemeral checkout(`fetch`+`reset`/`clone`)한 뒤, 테넌트 `.factory/quality.yaml` 기준으로 실행하고 **해당 `client_id` 프로젝트**에 `New` 티켓. `aa-clean-weekly`는 테넌트 `clean_code.command`(기계) + AA 스킬 휴리스틱 리뷰(스키마·절차는 persona)이며, 기능 Done/보안 게이트와 분리한다. **장시간 NF**(예상 런타임 ≫ `budget.timeout_ms`·스케줄 세션): 세션은 **기동만**(detach/`nohup`/Job)하고 포그라운드 대기를 하지 않는다. 워커·감시가 Active/`New` 티켓에 `nf-progress:` 하트비트 코멘트(또는 동등 progress 파일+코멘트)를 남겨 진행 증거를 유지한다. pm 독촉은 백업이며, 하트비트가 있으면 alive로 보고 **재실행하지 않는다**.
11. **지식 계층·wiki-first** — §2.9.
12. 상태 id는 프로젝트마다 다를 수 있으므로 스킬·프롬프트는 **이름→id 매핑**을 쓰고 숫자를 하드코딩하지 않는다.
13. **human 오배정/오멘션 정정 (PM)** — 주기 점검(`pm-checkpoint`) 때 `Waiting for Approval`·`@eric` 요청을 훑는다. 다음 액션이 에이전트 실행 가능(PR 리뷰/머지·QA E2E·AA·TA CD·KM wiki·구현)이면 올바른 상태·assignee·`@mention`으로 되돌리고 정정 코멘트를 남긴다. 시크릿·RBAC·제품/범위 판단 등 사람 전용 ask는 Approval 유지(모호하면 유지).
14. **기능 루프 진행 관리 (PM)** — `pm-checkpoint`(`gates: [flow_active]`)는 `In Progress`뿐 아니라 `Review`·`Deploying Test`·`QA`·`Deploying Prod` 정체도 본다. 개발 timebox(≈30분)와 Deploy/QA stall(≈2h, 증거/`@mention`/`nf-progress:` 없이 멈춤)을 구분한다. Deploy/QA에서 PM은 **실행하지 않는다**(TA CD·QA E2E·AA 보안은 각 레인). **`nf-progress:`(또는 동등) 하트비트·진행 코멘트는 stall 시계를 리셋하는 증거**다. **Stall 사다리:** (1) stall ≥2h → 담당 assignee `@mention` health-check 1회(alive→progress 요청); (2) 그 health-check 이후 ≈1h 무응답·무하트비트 → `@ta` **assignee-runtime-check**만(Pod Ready·runner 로그 `session.prompt.skipped`/`session.recover`·zombie/`active_run` — EX/E2E/보안/CD 대행 금지); (3) TA 판정 alive → 원 assignee resume, dead → restart/`Blocked`/새 session. R1–R5 자동 복구와 중복 금지: 최근 `session.recover` 성공이면 재기동을 중복하지 말고 원 assignee 재부착. PM은 kubectl 금지. **`@mention`만으로 alive 판정 금지** — 런타임 증거(로그/TA 점검) 없으면 dead로 단정하지 않는다. soft `budget.timeout_ms` 만료 ≠ 복구 완료. **체크포인트 코멘트:** 티켓당 `<!-- pm-checkpoint-status -->` 상태판 1개만 두고 no-op/SLA/skip는 `edit_comment`로 갱신한다. `@mention` 핸드오프·misroute 정정만 `add_comment` 신규. `PM verify`/`Outcome record only` 신규 금지. KM 주간/스케줄 잡은 별도 `schedules[]`이며, KM이 맡은 티켓이 flow 상태면 동일 stall 규칙으로 재멘션한다.

### 2.7 Goose A안 실행 정책 (부가)

§1–2.6·§2.8·§2.9 계약은 불변이다. Goose 분석 기반 보수 도입(A안)은 Cursor SDK local runner와 Leantime 오케스트레이션을 유지한 채, run `budget`/`policy`/summary/`success_checks`를 prompt·로그 수준에서만 추가한다. 상세·단계는 [`docs/goose/06-gap-with-cursor-agent.md`](docs/goose/06-gap-with-cursor-agent.md), runner 내부는 [`agent-runner/DESIGN.md`](agent-runner/DESIGN.md)를 본다. Goose 실행기·scheduler 교체는 A안 범위가 아니다.

### 2.8 Tenant CD + Clients (`clients[]` · `repos[].tenant_cd`)

정본: `deploy/k8s/agents.yaml`. **테넌트 신원 = `leantime_client_id`(Leantime Client).**

#### `clients[]`

| 필드 | 타입 | 설명 |
|------|------|------|
| `leantime_client_id` | int | 정본 키 (필수, unique) |
| `id` | string | 선택 슬러그 (예: `acme`) |
| `repo_ids` | string[] | 소속 `repos[].id` |
| `project_id` | int | NF·결함 티켓 기본 Leantime project |
| `status_map` | object | 보드 이름→numeric status id (선택; 없으면 `settings.status_board`) |

#### `repos[].tenant_cd`

| 필드 | 타입 | 설명 |
|------|------|------|
| `enabled` | bool | `true`일 때만 레지스트리·Done 게이트 대상 |
| `driver` | string | v1: `workflow_dispatch`만 |
| `workflow` | string | 테넌트 `.github/workflows/` 파일명 |
| `ref` | string | dispatch ref (보통 `main`) |
| `inputs` | object | 고정 입력; `environment`는 `test` 또는 `production` |
| `image_input` | string | merge SHA input 이름(기본 `image_tag`) |
| `verify.*` | object | rollout + HTTP smoke (환경별로 inputs/verify를 테넌트 workflow가 해석) |

- **`repos[]`**: `id`, `git_repo_url`, 선택 `tenant_cd`, 선택 `client_id`(또는 `clients[].repo_ids`로 소속).
- **`agents[]`**: `primary_repo`/`repos`로 workspace. 직원 5인에는 `client_id`를 두지 않는다. 개발자 agent는 선택적으로 client/repo 귀속.
- `render-agents.sh` → TA(ta) `.cursor/tenant-cd-registry.json`. **bridge.json에는 미포함.**
- `render-agents.sh` → qa / aa / ta `.cursor/clients-repos-registry.json` (`clients[]`×`repos[].git_repo_url`). 주간 NF·품질 게이트는 `tenant-repo-sync`로 ephemeral sync 후 `.factory/quality.yaml`을 읽는다( primary workspace만 믿지 않음 ).
- `repos[]` `org-wiki`/`wiki` → `ORG_WIKI_URL`. 품질 discovery는 테넌트 `.factory/quality.yaml`(`examples/tenant-quality/`).

`enabled: false` 또는 필드 없음 → CD 비대상.

**기능 Done 증거** (CD 대상, 코멘트 합산):

1. `pr_url`, `merge_sha`
2. **test:** `test_workflow_run_url`, `test_workflow_conclusion=success`, `test_rollout:` … OK, `test_smoke:` HTTP …
3. `qa:` E2E pass (시나리오 id·증거); 해당 시 `bulk_api:` / `opik:`
4. `aa:` security pass
5. **prod:** `prod_workflow_run_url`, `prod_workflow_conclusion=success`, `prod_rollout:` … OK, `prod_smoke:` HTTP … (또는 패키지 배포 증거)

레지스트리 shape: `{ "version": 2, "tenants": [ { "client_id", "agent?", "repo_id?", "git_repo_url", "tenant_cd" } ] }`. 조회 키: **`client_id` + `repo_id`** (또는 git URL). agent 이름만으로 테넌트를 추론하지 않는 것을 권장(legacy 호환은 agent 필드 유지).

### 2.9 전사 지식 (org-wiki)

정본 repo: `agents.yaml` `repos[]`의 `id: org-wiki`(레거시 별칭 `wiki`도 `ORG_WIKI_URL` 주입에 허용). Pod env `ORG_WIKI_URL`로 URL을 주입한다(`render-agents.sh`).

| 계층 | 정본 | 쓰기 |
|------|------|------|
| L0 | 각 제품/공장 repo의 `ARCHITECTURE`/`DESIGN` | 해당 repo 전담. wiki에 **복사 금지**(링크만) |
| L1 | Leantime 티켓·코멘트 | 담당 agent. 문의·보고·위임·지시 |
| L2 | org-wiki | **읽기:** 전원. **기여:** `inbox/{agent}/`만(비-km). **정본:** km만(`INDEX.md`, `wiki/` canonical). Quartz는 `wiki/`만 배포; `inbox/`·`raw/` 비공개 |
| L3 | persona `MEMORY.md` | 배포 시드(최초 1회)·운영 힌트. Pod 내 수정은 PVC에 **유지**(재시작·재배포 시 ConfigMap으로 덮어쓰지 않음). 시드 재적용은 dest 삭제 후 Pod restart. 조직 사실을 두지 않음 |

규칙:

1. **wiki-first** — 조사·외부 사실 확인 전 `INDEX.md` 및 관련 페이지를 검색한다. miss·stale(`review_after` 경과)·L0에 없는 외부 사실일 때만 웹 검색.
2. **작업 후** — 재사용 지식이면 `inbox/{agent}/YYYY-MM-DD-slug.md`를 main에 직푸시하고 Active 티켓에 경로를 적는다. 없으면 `wiki: N/A — <사유>`.
3. **km** — `inbox/`(및 `@km` brief)를 `wiki/` canonical로 합성하고 `INDEX.md`를 갱신한 뒤 **inbox 원본을 삭제**(`git rm`). 스케줄 `km-wiki`는 리서치 ingest + inbox drain. PR/`git-ship`/feature branch 금지(main 직푸시).
4. seewin 정치 위키 등 테넌트 전용 SSoT와 org-wiki는 병합하지 않는다.

절차 정본: `_default` `org-knowledge`, km `knowledge-promote` / `km-researcher`.

## 3. 인증·비용

- 전 runner가 동일 `CURSOR_API_KEY` 공유 (Secret `cursor-api-key`, 사용량 합산).
- 공장 운영: `cursorbridge-pvc-retention`이 agent PVC의 `/cursor-home/.cursor/chats`를 보관일(`CHAT_RETENTION_DAYS`) 기준으로 삭제한다. `cursorbridge-spend-alert`는 usage 합산 후 Leantime에서 **프로젝트/에이전트 이름**으로 id를 resolve해 티켓을 만든다(숫자 id 하드코딩 금지).
- Leantime MCP는 포크 `leantime-mcp/`(agent-runner 이미지). agent별 **`LEANTIME_ACCESS_TOKEN`**(해당 Leantime 사용자 PAT, Secret `LEANTIME_ACCESS_TOKEN_{name}`)으로 Bearer 인증한다. Leantime 3.9+ PAT는 댓글·쓰기 작성자가 해당 사용자로 표시된다.
- agent-runner 이미지는 **Python 3.12 + uv**, **kubectl**, **gh**, **git**을 포함한다. K8s: 일반 봇은 ServiceAccount `cursor-agent` + ClusterRole `cursor-agent-observer`(**read-only**). **ta만** SA `cursor-agent-ta` + ClusterRole `cursor-agent-ta-operator`(모니터링·제한적 `patch`/`update`/`delete`, `pods/exec`, Namespace **create**만·delete 없음) 및 공장 test NS(`sw-factory`) Role `cursor-agent-test-ns-write`(CM·Secret·Service·PVC·Ingress·Deploy/STS·Pod write). 추가 테넌트 test NS Role은 **로컬 overlay**(실고객 NS 이름은 git에 두지 않음). RBAC 객체 write·Secret 클러스터 전역 list는 미부여. path-graph Argo Role은 당분간 `cursor-agent-ta`에 바인딩(path bot 재도입 시 전용 SA). **봇 runner**는 Secret `cursor-api-key`의 **`GH_TOKEN`(또는 `gh_token_secret_key` / `GH_TOKEN_{name}`)** 필수 — 시작 시 `gh auth setup-git`. ta는 `GH_TOKEN_ta`로 factory `publish-runner.yml`을 `gh workflow run`(Actions write); GHCR **push**는 워크플로 `GITHUB_TOKEN`, **pull**은 `ghcr-pull` Secret.
- SDK run은 IDE와 동일 usage pool을 사용한다.
- M0에서 티켓당 토큰을 측정한 뒤 10 agent 확장 여부를 결정한다.
