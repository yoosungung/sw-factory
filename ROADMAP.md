# ROADMAP.md

## 현황 (2026-07-27)

**Framework vs Tenant:** 이 저장소는 설치형 **agent 프레임워크(공장)** 다. 제품 비즈니스 소스는 테넌트 repo(`agents[].git_repo_url`)에만 둔다. **운영 SW CD는 프레임워크 범위**(M5). 공장 자체 운영(M4 PVC·spend)과 테넌트 CD·SDLC 게이트(M5–M9)를 문서에서 섞지 않는다.

M0–M3 코드·K8s·이미지 배포 완료. M5 Tenant CD 공장 측 구현 완료(실클러스터 데모 티켓은 수동).

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
- [x] candy Hermes(`openai`) → agent-runner(`sessions`) + persona `leantime-pm` 이식·컷오버
- [x] infra persona + `k8s-operator-operations` 스킬 + `infra-k8s-daily` 스케줄 + ClusterRole observer

## M5 — Tenant CD (운영 SW CD)

프레임워크가 테넌트 앱의 merge→deploy→smoke→Done을 해결한다. 제품 비즈니스 코드는 이 repo에 넣지 않는다.

- [x] `ARCHITECTURE` §0 경계 + §2.8 `tenant_cd` 스키마·증거 필드
- [x] `repos[]` / agent `primary_repo` 분리 (`repos.py`; legacy agent 필드 호환)
- [x] `render-agents.sh` → infra `.cursor/tenant-cd-registry.json` + pytest
- [x] infra `tenant-cd` 스킬 (`workflow_dispatch` + rollout + HTTP smoke)
- [x] candy merge→infra 핸드오프·Done 4필드 게이트
- [x] `examples/tenant-cd/` 워크플로 어댑터
- [x] 공장 측 체인·증거 게이트 테스트 (`test_tenant_cd.py` framework E2E)
- [ ] 데모 테넌트 실클러스터 티켓 루프 1건 (asky/`askwho.net`: 워크플로 구현 + verify URL 확정 후 [`examples/tenant-cd/E2E.md`](examples/tenant-cd/E2E.md))

**성공기준:** 데모 테넌트에서 사람 kubectl 없이 dispatch→rollout→smoke 코멘트→Done. 새 테넌트는 `repos[].tenant_cd` + 어댑터 복사로 동일 루프. (공장 자동화 검증은 pytest로 충족; 실클러스터는 수동 체크리스트.)

**비범위 (M5):** `kubectl set image`/Argo CLI 기본 드라이버, 제품 소스 흡수, `docs/candidate/` 크론 런타임 편입(아래 seewin Phase B). 다배포/`depends_on` DAG는 테넌트 workflow에 두고 공장 스키마 확장은 후속.
## M5b — seewin (candidate.win 전담)

- [x] Phase A: `seewin` `sessions` 봇 온보딩(`agents.yaml`, persona, `LEANTIME_ACCESS_TOKEN_seewin`, 공유 `GH_TOKEN`, Pod `/healthz`)
- [x] Phase B: `docs/candidate/` Candydate cron → LLM `settings.schedules` + K8s CronJob(스크립트) 이식
- [x] Hermes 동일 Candydate cron 수동 disable 컷오버 (`docs/candidate/CANDYDATE_CRON_PORTING.md` §7)

**성공기준(A):** assignee=`seewin` 티켓이 `cursor-agent-seewin` 세션을 연다. **(B):** 6잡 스케줄/CronJob 공장 등록 + Hermes cron 수동 disable 완료.

## M6 — Review 품질 게이트 (FW CI + 테넌트 checks)

- [x] FW CI `fw-supply-chain`: gitleaks + `npm audit --audit-level=critical` (공장 repo만)
- [x] `git-ship` / candy: 테넌트 required checks 실패 시 merge 금지

## M7 — Build 검증 증거

- [x] Review 전 테스트/CI 증거 또는 `test:`/`browser:` N/A 코멘트 의무 (`git-ship`, `agent-workflow.mdc`)
- [x] 프레임워크에 Playwright 플랫폼 비내장

## M8 — Planning 템플릿

- [x] candy `intake-template.md` (Goal/Non-goals/AC/Architecture notes)
- [x] 수용 기준 없이 In Progress 금지; 제품 vision은 테넌트/Leantime

## M9 — LOOP #2 훅

- [x] `github-issue-check` 유지(설정 가능 GH→티켓)
- [x] infra `incident-tickets.md` + 일일 스케줄: 조치 가능 장애→티켓(mutate 없음)
- [ ] 제품 APM/지원 포털 연동 (테넌트 선택; 공장 비범위)

---

## 다음 수동 작업

1. Leantime **My Apps → CursorBridge 활성화**
2. 티켓 assignee=agent → 코멘트/상태 변경으로 E2E 검증
3. candy: `cursor-agent-candy` 배포 후 assignee/스케줄 E2E, Hermes `openai` 트래픽 제거 확인
4. M5: 데모 테넌트에 `tenant_cd`·`examples/tenant-cd` 워크플로 연결 후 실 E2E
5. `./deploy/k8s/scripts/render-agents.sh && python deploy/k8s/scripts/sync-bridge-json.py` 후 infra/candy persona 반영
6. `git commit` + `git push` (변경분 다수 unstaged)
