# ARCHITECTURE.md

Leantime × Cursor Agent 협업 시스템 계약 및 인터페이스.

## 0. Framework vs Tenant

| | **Agent Framework (이 저장소)** | **Tenant project (외부 repo)** |
|--|--------------------------------|-------------------------------|
| 역할 | 설치형 공장: Bridge, runner, persona, **운영 SW CD 메커니즘** | 개발·운영되는 앱/서비스 **소스·이미지·도메인 설정** |
| 코드 | 공장 코드만 | `repos[].git_repo_url`이 가리키는 제품 소스만 |
| CD | 프레임워크가 해결(dispatch·rollout·smoke·Done 게이트) | CD *대상* + 워크플로/매니페스트/값(`examples/tenant-cd` 어댑터 복사) |

제품 비즈니스 소스를 이 저장소에 두지 않는다. 운영 SW를 PROD에 올리는 CD는 공장 범위다. Review checks·테스트 증거·intake 템플릿·장애→티켓 훅(M6–M9)도 **공장 정책/스킬**이며, 테넌트 CI·E2E·APM 본체는 테넌트 repo에 둔다.

## 1. 계약사항 (불변 규칙)

1. **Cloud Agent 미사용** — `type: sessions` 계정은 SDK `local` runtime만 사용한다. `type: openai`는 외부 OpenAI-compatible API(예: Hermes)다.
2. **별도 Bridge 서비스 없음** — 오케스트레이션은 Leantime `CursorBridge` 플러그인이 담당한다.
3. **티켓 ↔ session/conversation 1:1** — `ticket_id`마다 고유 `agent_id` 하나; 플러그인 DB가 포인터를 보관한다. `sessions`는 Cursor `agent_id`, `openai`는 named `conversation`(`leantime-ticket-{id}`).
4. **Leantime 계정 ↔ runner 1:1** — 최대 10 agent; `bridge.json` / `agents.yaml`이 정본이다. `sessions`는 `cursor-agent-{name}` Pod(+PVC), `openai`는 외부 `runner_url`.
5. **이벤트 기반 실행** — Leantime 이벤트 또는 플러그인 `schedules[]` 틱이 있을 때만 runner에 inference를 요청한다. 스케줄 틱도 CursorBridge가 오케스트레이션하며 runner를 직접 cron하지 않는다.
6. **자기 반향(self-echo) 억제** — `type`이 `human`이 아닌 에이전트가 **자기 담당 티켓**에 낸 이벤트만 담당 runner 디스패치를 생략한다. 다른 에이전트·인간이 낸 이벤트(에이전트 간 코멘트 포함)는 정상 라우팅한다.
7. **읽기 우선** — 에이전트는 Leantime MCP로 `get_ticket` / `get_comments` 후 행동한다.
8. **K8s namespace** — `leantime` (Leantime과 동일 NS).
9. **모델** — `deploy/k8s/agents.yaml` 정본: `settings.model` 기본값, bot마다 `agents[].model`로 override. Pod `AGENT_RUNNER_MODEL`에 주입; 기본 `composer-2.5` (비용 예측 가능); `auto`는 선택 사항.
10. **Tenant CD** — `repos[].tenant_cd.enabled=true`인 제품 repo의 배포는 공장(infra `tenant-cd` 스킬)이 수행한다. agent는 `primary_repo`/`repos`로 그 repo를 참조한다. v1 드라이버는 `workflow_dispatch`만. 상세는 §2.8.

## 2. 컴포넌트 간 인터페이스

### 2.1 bridge.json (정적)

경로: `leantime-plugin/bridge.json`

| 필드 | 타입 | 설명 |
|------|------|------|
| `agents[]` | array | ≤10; `name`, `leantime_user_id`, `email`, `runner_url`, `git_repo_url`(sync가 `primary_repo` resolve), `persona`, `type`(`human`\|`sessions`\|`openai`). `human`: Pod 없음·`runner_url` 빈 문자열. `sessions`: Pod/Service `cursor-agent-{name}`, sync가 runner_url 생성, `model`(선택), `gh_token_secret_key`(선택, 기본 `GH_TOKEN`). `openai`: YAML `runner_url` 필수(외부 OpenAI-compatible), StatefulSet 없음. `tenant_cd`는 **bridge.json에 넣지 않음** — infra `tenant-cd-registry.json`만(§2.8) |
| `model` | string | 기본 모델 (`agents.yaml` `settings.model`에서 sync; `sessions`별 override는 `agents[].model`) |
| `debounce_ms` | int | 동일 티켓 이벤트 디바운스 |
| `prompts` | object | `ticket_created`, `ticket_updated`, `comment_added`, `assignee_changed`, `mention` (`{ticket_id}`), `handoff`. Router가 매 이벤트에 `Active ticket_id=N` 스코프 문장을 붙여 MCP 읽기/쓰기를 그 티켓으로 고정한다. |
| `status_prompts` | object | 상태별 추가 프롬프트 (M3) |
| `mention_routing` | bool | Tiptap `data-tagged-user-id` 또는 `@email` 멘션 시 해당 runner 알림 (M3) |
| `schedules[]` | array | 주기 프롬프트. `id`, `cron`(5필드·UTC), `prompt` 필수; `agents`(name 목록) 생략 시 `type != human`이고 `runner_url` 비어 있지 않은 전원. 선택 `gates`(string 배열, **생략/`[]` = 무조건 발사**): 나열된 게이트를 **AND**로 만족할 때만 세션 생성. 현재 지원 `in_progress`(top·sub `status=4` 존재). 미지원 게이트는 발사하지 않음(fail-closed). 정본은 `deploy/k8s/agents.yaml` `settings.schedules` → sync |

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

HTTP 계약은 불변. 프로세스 내부는 **parent(Hono, SDK 미로드) + SDK worker pool**: 잡마다 worker가 `create`/`resume` → `send` → `wait` → handle `close`. Pre-lease로 idle/age/jobs 초과 worker를 교체하고, in-band auth 독성 시 해당 worker만 retire 후 1회 재시도한다.

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

### 2.5 Persona 번들 (`deploy/personas/_default/` + `deploy/personas/{persona}/`)

`render-agents.sh`가 `_default/`와 persona 오버레이를 병합해 ConfigMap `persona-{persona}`를 생성한다.

| 파일 | PVC 대상 | 병합 |
|------|----------|------|
| `mcp.json` | `~/.cursor/mcp.json` | `mcpServers` deep merge (persona가 서버명 단위 override) |
| `MEMORY.md` | `~/.cursor/MEMORY.md` | `_default` + persona append |
| `skills/**` | `~/.cursor/skills/**` | 번들 내 `.cursor/skills/` — 경로별 overlay (persona wins) |
| `rules/**` | `~/.cursor/rules/**` | 번들 내 `.cursor/rules/` — 경로별 overlay (persona wins) |
| `cli-config.json` | `~/.cursor/cli-config.json` (선택) | persona 파일이 있으면 대체, 없으면 `_default` |

### 2.6 에이전트 협업 프로토콜

1. MCP 읽기 우선 — 이벤트 프롬프트의 `Active ticket_id`만 범위.
2. 쓰기는 `add_comment` 우선 — `module_id`는 Active ticket_id.
3. 상태(CD 대상 티켓): 구현 완료 → **Review** → (candy merge) → infra **Deploying**(assignee/`@mention`) → smoke 증거 → **Done**. `tenant_cd` 없는 티켓은 기존처럼 Review → Done.
4. **리뷰 핸드오프 전 배송(ship) 필수** — 봇 runner Pod에는 사람이 없다. `commit` → `git push` → PR(생성 또는 갱신)을 **에이전트가** 완료한 뒤 Leantime Review·`@mention`한다. push/PR을 사람에게 요청하지 않는다. 절차는 persona `git-ship` 스킬이 정본.
5. 핸드오프: assignee 변경 + **같은 티켓** 코멘트(PR 링크·변경 요약); session은 티켓에 귀속. merge 후 CD 대상이면 infra로 넘기고 `merge_sha`를 코멘트에 넣는다.
6. `@mention` 시 해당 Leantime user의 runner에도 알림 (M3).
7. 에이전트 간 코멘트는 허용; 담당자 에이전트가 자기 코멘트로 재기동되는 것만 억제.
8. `GH_TOKEN`·push 실패 시: 티켓에 blocker를 남기고 플랫폼 담당자(`eric`)에게 `@mention` — **사용자에게 로컬 push를 요청하지 않는다.**
9. **Done 게이트 (CD 대상):** candy는 §2.8 증거 필드가 모두 있을 때만 Done. merge ≠ Done.

### 2.7 Goose A안 실행 정책 (부가)

§1–2.6·§2.8 계약은 불변이다. Goose 분석 기반 보수 도입(A안)은 Cursor SDK local runner와 Leantime 오케스트레이션을 유지한 채, run `budget`/`policy`/summary/`success_checks`를 prompt·로그 수준에서만 추가한다. 상세·단계는 [`docs/goose/06-gap-with-cursor-agent.md`](docs/goose/06-gap-with-cursor-agent.md), runner 내부는 [`agent-runner/DESIGN.md`](agent-runner/DESIGN.md)를 본다. Goose 실행기·scheduler 교체는 A안 범위가 아니다.

### 2.8 Tenant CD (`repos[].tenant_cd`)

정본: `deploy/k8s/agents.yaml`.

- **`repos[]`**: `id`, `git_repo_url`, 선택 `tenant_cd`. CD·clone URL의 정본.
- **`agents[]`**: `primary_repo`(또는 `repos: [id, …]`의 첫 항목)로 workspace를 참조. agent에 `git_repo_url`/`tenant_cd`를 같이 두면 오류(legacy: `primary_repo` 없을 때만 `agents[].git_repo_url`+`tenant_cd` 허용).
- `render-agents.sh`가 enabled `tenant_cd`를 infra persona ConfigMap `.cursor/tenant-cd-registry.json`으로 넣는다. **bridge.json에는 실리지 않는다.** 실행 절차는 infra `tenant-cd` 스킬.

| 필드 | 타입 | 설명 |
|------|------|------|
| `enabled` | bool | `true`일 때만 레지스트리·Done deploy 게이트 대상 |
| `driver` | string | v1: `workflow_dispatch`만 |
| `workflow` | string | 테넌트 `.github/workflows/` 파일명 (예: `deploy.yml`) |
| `ref` | string | dispatch ref (보통 `main`) |
| `inputs` | object | workflow_dispatch 고정 입력(문자열 값) |
| `image_input` | string | merge SHA를 넣을 input 이름(기본 `image_tag`) |
| `verify.namespace` | string | `kubectl rollout status` 대상 NS |
| `verify.deployment` | string | Deployment 이름 |
| `verify.timeout_sec` | int | rollout 대기(초, 기본 300) |
| `verify.smoke.type` | string | v1: `http` |
| `verify.smoke.url` | string | in-cluster URL (예: `http://svc.ns.svc:port/healthz`) |
| `verify.smoke.expect_status` | int | 기대 HTTP 상태(기본 200) |

`enabled: false` 또는 필드 없음 → CD 비대상(deploy 증거 면제).

**증거 코멘트 필수 필드** (CD 대상 Done 전):

1. `pr_url`, `merge_sha`
2. `workflow_run_url`, `workflow_conclusion=success`
3. `rollout:` `namespace`/`deployment` OK (또는 실패 요약)
4. `smoke:` HTTP `<status>` `<url>`

레지스트리 JSON shape: `{ "version": 1, "tenants": [ { "agent", "repo_id?", "git_repo_url", "tenant_cd": { ... } } ] }`. infra는 티켓의 agent / `repo_id` / repo URL로 조회한다.

## 3. 인증·비용

- 전 runner가 동일 `CURSOR_API_KEY` 공유 (Secret `cursor-api-key`, 사용량 합산).
- 공장 운영: `cursorbridge-pvc-retention`이 agent PVC의 `/cursor-home/.cursor/chats`를 보관일(`CHAT_RETENTION_DAYS`) 기준으로 삭제한다. `cursorbridge-spend-alert`는 agent-runner 로그의 `run.completed` usage를 합산해 임계값 초과 시 Leantime 티켓을 만든다.
- Leantime MCP는 포크 `leantime-mcp/`(agent-runner 이미지). agent별 **`LEANTIME_ACCESS_TOKEN`**(해당 Leantime 사용자 PAT, Secret `LEANTIME_ACCESS_TOKEN_{name}`)으로 Bearer 인증한다. Leantime 3.9+ PAT는 댓글·쓰기 작성자가 해당 사용자로 표시된다.
- agent-runner 이미지는 **Python 3.12 + uv**, **kubectl**, **gh**, **git**을 포함한다. K8s Pod는 ServiceAccount `cursor-agent` + ClusterRole `cursor-agent-observer`로 클러스터 Pod/로그/워크로드/PV·PVC 모니터링과 제한적 remediation(`patch`/`update`/`delete`, `pods/exec`). **RBAC 객체(write)는 부여하지 않는다**(자기권한 상승 방지). namespace `path-graph`에서는 Role `cursor-agent-argo-workflows`로 `workflows.argoproj.io`에 `get`/`list`/`create`/`delete`/`patch`(path Argo 조회·재실행·정리). Secret 클러스터 전역 list는 기본 미부여 — Postgres 등 Secret 읽기가 필요하면 Eric이 별도 부여. **봇 runner**는 Secret `cursor-api-key`의 **`GH_TOKEN`(공유 GitHub PAT, repo write)** 필수 — 시작 시 `gh auth setup-git`. agent별 override는 선택 키 **`GH_TOKEN_{name}`** → env `GH_TOKEN_OVERRIDE`(있으면 `GH_TOKEN`을 대체). GHCR pull은 별도 `ghcr-pull` Secret.
- SDK run은 IDE와 동일 usage pool을 사용한다.
- M0에서 티켓당 토큰을 측정한 뒤 10 agent 확장 여부를 결정한다.
