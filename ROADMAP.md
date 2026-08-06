# ROADMAP.md

## 현황 (2026-07-29)

**Framework vs Tenant:** 이 저장소는 설치형 **agent 프레임워크(공장)** 다. 제품 소스·품질 기준은 테넌트(client) repo. **운영 SW CD·듀얼 루프는 프레임워크 범위**(M5/M11).

M0–M10 완료(실클러스터 데모·일부 수동 검증 제외). **M11 Dual-loop** 진행.

---

## M0 — 계약·스파이크 ✅ / 🟡

- [x] ARCHITECTURE.md, bridge.json 스키마
- [x] Comment 훅, agent-runner mock E2E
- [ ] 실 SDK 스파이크 (`AGENT_RUNNER_MOCK=0`, 티켓당 토큰 측정)

## M1 — Plugin + agent-runner ✅ / 🟡

- [x] Listener, Router, SessionStore, RunnerClient, ResilientRunnerClient
- [x] SQLite 파일 영속화, 재시도 큐, `scripts/flush-retries.sh`
- [x] 티켓 뮤텍스 (Router + agent-runner)
- [x] TypeScript `@cursor/sdk` agent-runner, JSON 상관 로그
- [x] `bridge.json` ↔ `agents.yaml` (5 agent)
- [x] Leantime Pod 배포 + **My Apps 등록·활성화** (`composer.json version`, `Services/CursorBridge.php`)

## M2 — K8s ✅

- [x] bot만 StatefulSet (`cursor-agent-{name}`); `type: human`/`openai`는 Pod 미배포; `type` = `human`\|`sessions`\|`openai`
- [x] Secret `cursor-api-key`, `ghcr-pull`
- [x] 이미지 `ghcr.io/yoosungung/cursor-agent-runner:latest` (amd64)
- [x] **5/5 Pod Running**, `/healthz` OK

## M3 — 워크플로 ✅ (코드)

- [x] assignee 핸드오프, status_prompts, @mention
- [x] Leantime 실환경 E2E (티켓 → runner → 코멘트, `LEANTIME_ACCESS_TOKEN_{name}` PAT 등록 후 작성자 검증)

## M4 — 운영 ✅

- [x] PVC chat retention CronJob (`cursorbridge-pvc-retention`, 기본 14일, `/cursor-home/.cursor/chats`)
- [x] CURSOR_API_KEY spend 알림 (`cursorbridge-spend-alert`, 24h `run.completed` usage ≥ threshold → Leantime 티켓)
- [x] retry queue 주기 flush (`cursorbridge-flush-retries` CronJob, 5분)
- [x] agent 공통/개별 `schedules[]` (`agents.yaml` → `bridge.json`, `cursorbridge-schedule-tick` CronJob)
- [x] agent-runner SDK worker pool (auth 격리·pre-lease recycle·auth-stale retire)
- [x] Goose A안(보수): docs + runner `budget`/`policy` preamble·로그, `success_checks`, context summary, tool-class/delegation prompt (`docs/goose/06-gap-with-cursor-agent.md`)
- [x] Goose A안 Phase 2: `success_checks` hard 검증(SDK `status=finished` AND 마지막 Leantime mutation) + 같은 session 제한 재시도(`success_retry.max_attempts`) → `verification_failed` (`agent-runner/src/success-verify.ts`)
- [x] success_check 완화: 기본 `max_attempts=1`, infra abort, same-reason stop, JSON-RPC read-after-write, softer retry prompt
- [x] create storm breaker (`create_throttled` 429) + Bridge non-retry + MCP sticky_reset + `/readyz` MCP probe
- [x] agent-runner zombie `active_run` recovery R1–R5 (`session.recover`; DESIGN § Recovery · #197)
- [x] pm Hermes(`openai`) → agent-runner(`sessions`) + persona `leantime-pm` 이식·컷오버
- [x] ta persona + `k8s-operator-operations` 스킬 + `ta-k8s-daily` 스케줄 + ClusterRole observer

## M5 — Tenant CD (운영 SW CD)

프레임워크가 테넌트 앱의 merge→deploy→smoke→Done을 해결한다. 제품 비즈니스 코드는 이 repo에 넣지 않는다.

- [x] `ARCHITECTURE` §0 경계 + §2.8 `tenant_cd` 스키마·증거 필드
- [x] `repos[]` / agent `primary_repo` 분리 (`repos.py`; legacy agent 필드 호환)
- [x] `render-agents.sh` → ta `.cursor/tenant-cd-registry.json` + pytest
- [x] ta `tenant-cd` 스킬 (`workflow_dispatch` + rollout + HTTP smoke)
- [x] pm merge→ta 핸드오프·Done 4필드 게이트
- [x] `examples/tenant-cd/` 워크플로 어댑터
- [x] 공장 측 체인·증거 게이트 테스트 (`test_tenant_cd.py` framework E2E)
- [ ] 데모 테넌트 실클러스터 티켓 루프 1건 (asky/`askwho.net`: 워크플로 구현 + verify URL 확정 후 [`examples/tenant-cd/E2E.md`](examples/tenant-cd/E2E.md))

**성공기준:** 데모 테넌트에서 사람 kubectl 없이 dispatch→rollout→smoke 코멘트→Done. 새 테넌트는 `repos[].tenant_cd` + 어댑터 복사로 동일 루프. (공장 자동화 검증은 pytest로 충족; 실클러스터는 수동 체크리스트.)

**비범위 (M5):** `kubectl set image`/Argo CLI 기본 드라이버, 제품 소스 흡수, 테넌트 전용 cron 런타임 편입(로컬 `docs/`). 다배포/`depends_on` DAG는 테넌트 workflow에 두고 공장 스키마 확장은 후속.

## M5b — 테넌트 온보딩(sessions 봇) 이력

- [x] Phase A: sessions 봇 온보딩 패턴
- [x] Phase B: 테넌트 cron → LLM `settings.schedules` + (선택) K8s CronJob 이식 패턴
- [x] 실고객 재등록·PAT·`.env`·스케줄 상세는 **로컬 `docs/` / `agents.yaml`** (git 비포함)

**성공기준:** 로컬 agents에 등록한 developer assignee 티켓이 해당 `cursor-agent-{name}` 세션을 연다. 스케줄/CronJob은 공장 메커니즘으로 등록 가능.

## M6 — Review 품질 게이트 (FW CI + 테넌트 checks)

- [x] FW CI `fw-supply-chain`: gitleaks + `npm audit --audit-level=critical` (공장 repo만)
- [x] `git-ship` / pm: 테넌트 required checks 실패 시 merge 금지

## M7 — Build 검증 증거

- [x] Review 전 테스트/CI 증거 또는 `test:`/`browser:` N/A 코멘트 의무 (`git-ship`, `agent-workflow.mdc`)
- [x] 프레임워크에 Playwright 플랫폼 비내장

## M8 — Planning 템플릿

- [x] pm `intake-template.md` (Goal/Non-goals/AC/Architecture notes)
- [x] 수용 기준 없이 In Progress 금지; 제품 vision은 테넌트/Leantime

## M9 — LOOP #2 훅

- [x] `github-issue-check` 유지(설정 가능 GH→티켓)
- [x] ta `incident-tickets.md` + 일일 스케줄: 조치 가능 장애→티켓(mutate 없음)
- [ ] 제품 APM/지원 포털 연동 (테넌트 선택; 공장 비범위)

## M10 — Org wiki (wiki-first + inbox 승격)

- [x] `ARCHITECTURE` §2.9 지식 계층(L0–L3)·wiki-first·inbox/canonical
- [x] `_default` `org-knowledge` + `agent-workflow` / MEMORY (km librarian)
- [x] km `knowledge-promote` + `km-researcher` + wiki 레이아웃 레퍼런스
- [x] `repos[]` `org-wiki` + km agent + `ORG_WIKI_URL` 주입 + `km-wiki` inbox drain

**성공기준:** 조사 시 wiki→웹 순서 고정; 작업 후 inbox 또는 `wiki: N/A`; km만 INDEX/canonical 갱신.

**비범위:** RAG/벡터DB, org-chart 런타임, seewin 정치 위키 병합.

## M11 — Dual-loop Soft Factory

공장 직원 5인(PM/KM/QA/TA/AA) + 인간|에이전트 개발자. 기능 루프(티켓→test→QA∥AA→prod)와 주간 비기능(부하·클린·대량품질→client 티켓). tenant ≡ Leantime `client_id`.

- [x] `ARCHITECTURE` §1.10–12 · §2.6 상태 보드 · §2.8 `clients[]` + 기능 Done 증거(test/qa/aa/prod)
- [x] `clients[]` + registry v2(`client_id`) + quality/Done 파서 TDD (`clients.py`, `feature_evidence.py`)
- [x] 고객사 Project status labels + `status_prompts` / gates / SETUP 절차
- [x] `examples/tenant-quality/` + tenant_cd `environment: test|production`
- [x] TA(`ta`) tenant-cd: test → `@qa` `@aa` → prod · `load-weekly`
- [x] QA/AA/TA `clients-repos-registry` + `tenant-repo-sync` (주간·게이트 전 ephemeral sync)
- [x] QA persona: `browser-e2e` · `bulk-api-probe` · `opik-eval` · `qa-bulk-weekly`
- [x] AA persona: `security-review`(티켓) · `clean-code-weekly`
- [x] AA `clean-code-weekly`: mechanical + Clean Code heuristic review (references·tenant criteria 분리)
- [x] PM(`pm`) Done 게이트(qa+aa+prod) · MEMORY 팀표 · `agents.yaml.sample` (qa/aa/clients)
- [x] 직원 개명: `candy`→`pm`, `finder`→`km`, `infra`→`ta` (persona·스케줄·샘플·문서)
- [x] 원샷 설치: `scripts/install-sw-factory.sh` + `seed_factory_users.py` (직원 5인·PAT·plugin enable, My Project 미생성)
- [x] 장시간 NF: detach + `nf-progress:` 하트비트; pm stall=헬스체크(§2.6 #10/#14 · weekly skills)
- [x] **agent-runner zombie `active_run` 복구** — worker crash 후 `skipped_active_run` 영구화 금지(R1–R5). 정본: [`agent-runner/DESIGN.md`](agent-runner/DESIGN.md) § Recovery · 계약 [`ARCHITECTURE` §2.3.1](ARCHITECTURE.md) / §2.6 #14.
- [x] **PM stall → TA runtime check** — Deploy/QA: ≥2h → assignee health-check; +1h 무응답 → `@ta` `assignee-runtime-check` (R1–R5와 별계층). 정본: [`ARCHITECTURE` §2.6 #14](ARCHITECTURE.md) · pm/ta skills · `pm-checkpoint` prompt.
- [x] **PM checkpoint status-board upsert** — `<!-- pm-checkpoint-status -->` + `edit_comment` for no-op/SLA; new `add_comment` only for actionable `@mention` (anti verify-spam). 정본: ARCHITECTURE §2.6 #14 · leantime-pm · `pm-checkpoint`.

**성공기준:** sample YAML로 registry에 `client_id`가 실리고, 기능 Done 파서가 test+qa+aa+prod를 요구하며, QA/AA persona 번들과 주간 스케줄 3종이 sample에 존재. ✅ (pytest)

**비범위:** Opik 서버 공장 설치, Client CRUD UI, 공장 내장 SAST/부하 엔진, 제품 소스 흡수.

---

## 다음 수동 작업

1. 고객사 Project에 M11 상태 보드 적용(`deploy/SETUP.md` Dual-loop status) — 시드가 `clients[].id` 프로젝트만 생성
2. 티켓 assignee=agent → 코멘트/상태 변경으로 E2E 검증
3. M5/M11: 데모 테넌트 `tenant_cd`·quality 어댑터 + 실 E2E
4. **M11 후속:** #172 QA 세션 수동 재기동(필요 시) — R1–R5·PM→TA stall 사다리는 문서/스킬 반영됨
5. **M11 후속: Ready-edge catch-up (재기동=출근)** — Bridge가 `/readyz` 전이(false→true) 시 티켓리스 `prompts.catch_up` 세션 1회. 정본: [`ARCHITECTURE` §1.5 / §2.4.2](ARCHITECTURE.md) · `ReadyCatchupTicker` · `_default` `agent-catch-up` · MCP `list_tickets(assigned_to=)`
6. `git commit` + `git push`
