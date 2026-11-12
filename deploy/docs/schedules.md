# Schedules 흐름 (v1 참고)

출처: `v1` `ARCHITECTURE.md` §1.5 · §2.4 · §2.6 #10/#15, `ScheduleTicker` / `DefaultScheduleGates`, `deploy/k8s/base/cronjob-schedule-tick.yaml`, 실정 스냅샷 [../agents.back.yaml](../agents.back.yaml) · sample `deploy/k8s/agents.yaml.sample`.

**main:** gateway `schedules[]`는 로컬 UTC cron + 기동 catch-up으로 이식됨 ([ROADMAP](../../ROADMAP.md) A8). Worker Cron `schedule_tick`은 쓰지 않는다.

---

## 1. 오케스트레이션 원칙

Inference wake는 다음 **세 종류만**이다 (runner/cursor는 자체 cron으로 티켓을 훑지 않음).

| # | 트리거 | 세션 형태 | Active ticket 스코프 |
|---|--------|-----------|----------------------|
| 1 | 티켓 도메인 이벤트 (create/update/comment/…) | 티켓 바인딩 | 있음 (`Active ticket_id=…`) |
| 2 | `settings.schedules[]` 틱 | **티켓리스** `POST /sessions` | **없음** — 에이전트가 MCP로 일 선택 |
| 3 | Ready-edge catch-up (재기동=출근) | 티켓리스 `prompts.catch_up` | **없음** — `agent-catch-up` |

스케줄 세션은 sticky `cursorbridge_sessions`(v1)에 **올리지 않는다**. 동일 `(schedule_id, YYYY-MM-DDTHH:MM)`는 **한 번만** 발사(SQLite dedupe).

---

## 2. 틱 파이프라인 (v1)

```
K8s CronJob cursorbridge-schedule-tick
  schedule: "* * * * *"  (UTC), concurrencyPolicy: Forbid
       │
       ▼
Leantime Pod: php …/CursorBridge/bin/tick-schedules.php
       │
       ├─► ScheduleTicker::tick()
       │     for each schedules[]:
       │       cron due? → claimScheduleFire(id, fireKey)
       │       gates AND pass? (empty = always)
       │       resolve agents → POST /sessions { prompt + success_checks, ticket_id: null }
       │
       └─► ReadyCatchupTicker (같은 바이너리)
             /readyz false→true 전이 봇에 catch_up 1회
```

### 2.1 `schedules[]` 스키마

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✓ | 안정 id (dedupe 키) |
| `cron` | ✓ | 5필드, **UTC** |
| `prompt` | ✓ | 티켓리스 standup 텍스트 (+ 선택 success_checks 부가) |
| `agents` | | name 목록. **생략/`[]`** → `type≠human` 이고 `runner_url` 비어 있지 않은 전원 |
| `gates` | | string[] **AND**. 생략/`[]` = 무조건 발사. 미지원 게이트 = **fail-closed(발사 안 함)** |
| `success_checks` | | 스케줄 전용 검증 문구(있으면 prompt에 append) |

정본 위치(v1): `agents.yaml` `settings.schedules` → sync → `bridge.json`.  
main 스냅샷: [../agents.back.yaml](../agents.back.yaml) `settings.schedules`.

### 2.2 Gates

| Gate | 의미 (v1) |
|------|-----------|
| *(없음)* | 항상 통과 |
| `in_progress` | status = In Progress 인 티켓 존재 |
| `flow_active` | In Progress **또는** Review / Deploying Test / QA / Deploying Prod 존재 |

`pm-checkpoint`만 `gates: [flow_active]` — 공장에 활성 플로우가 없으면 체크포인트 세션을 안 연다.

### 2.3 Agent resolve

1. `agents`에 이름이 있으면 그 목록만 (human·빈 runner_url skip).
2. 없으면 전 bot(`sessions`/`openai` 등 human 제외).

---

## 3. Ready catch-up (스케줄 항목 아님)

| 항목 | 내용 |
|------|------|
| 트리거 | runner `/readyz` **false→true** (v1: schedule CronJob이 함께 폴링). main: gateway 기동 시 `catch_up` 1회 |
| Prompt | `prompts.catch_up` + `{lookback_since}` (없으면 now−48h) |
| 스킬 | `_default` `agent-catch-up` |
| 절차 | 배정함 → 멘션 triage → **actionable 한 건만** 착수. 없으면 **쓰기 없이** 종료 |
| 금지 | 빈 Outcome 티켓, standby ack, CI-wait 되멘션, 다티켓 병렬 대진행 |

일일 STS restart(`cursorbridge-agent-restart`, v1 `0 15 * * *` UTC = KST 00:00)가 Ready-edge를 유발해 전원 출근 catch-up을 만든다. MEMORY/mcp dump는 이 경로(스킬 배포 대체 아님).

---

## 4. 스케줄 카탈로그

시각은 **UTC**. KST = UTC+9.

| id | cron (UTC) | KST 대략 | agents | gates | 목적 |
|----|------------|----------|---------|-------|------|
| `pm-checkpoint` | `5,20,35,50 * * * *` | 매시 :05/:20/:35/:50 | pm | `flow_active` | dual-loop stall·misroute·storm |
| `pm-roadmap-sync` | `0 3,9,15,21 * * *` | 06:00 / 12:00 / 18:00 / 00:00 | pm | — | ROADMAP current 1섹션 / pass-gate |
| `github-issue-check` | `0 23 * * *` | 08:00 | pm | — | GH Issue → client 티켓 (`client_id`+`project_id`) |
| `rhwp-batch-upstream-check` | `0 21 * * *` | 06:00 | rhwp_batch | — | edwardkim/rhwp Release → `rhwp/` · test · `v*` Action 배포 |
| `km-wiki` | `30 23 * * *` | 08:30 | km | — | inbox drain + research → main |
| `issue-radar-today` | `0 23 * * *` | 08:00 | candidate | — | issue_radar → publish_today → `wiki/data/today.yaml` |
| `publication-safety` | `0 18 * * *` | 03:00 | candidate | — | `publication_gate.py --base origin/main` PASS/HOLD |
| `people-ssot-curation` | `0 9 * * *` | 18:00 | candidate | — | people stub→curated (allowlist URL) · empty-diff no-op |
| `candidate-escalation-drain` | `0 2 * * *` | 11:00 | candidate | — | Pass A 이후 `pending.jsonl` escalation drain → wiki/PR |
| `ta-k8s-daily` | `0 1 * * *` | 10:00 | ta | — | k8s read-only 리포트 (현재 `agents.yaml` 주석) |
| `ta-load-weekly` | `0 2 * * 1` | 월 11:00 | ta | — | 주간 load (tenant quality) |
| `aa-clean-weekly` | `30 2 * * 1` | 월 11:30 | aa | — | 주간 clean-code |
| `qa-bulk-weekly` | `0 3 * * 1` | 월 12:00 | qa | — | 주간 bulk/Opik |

`github-issue-check`는 **pm만**. 대상 repo는 `repos[]` 중 `client_id`와 `project_id`가 **둘 다** 있는 항목(시드가 `.cursor/github-issues-registry.json`에 씀). `nl2sql`·`org-wiki`처럼 한쪽만 있거나 없는 행은 제외.

`issue-radar-today` cron `0 23 * * *` UTC = **08:00 KST** (`schedule:issue-radar-today-0800-kst`). Leantime 승인 경로 없음; empty `items`로 기존 `today.yaml` 덮어쓰기 금지.

`publication-safety` cron `0 18 * * *` UTC = **03:00 KST** (`schedule:publication-safety-0300-kst`). Pass 스택을 gate에 ff merge 금지; HOLD면 push 금지.

`people-ssot-curation` cron `0 9 * * *` UTC = **18:00 KST** (`schedule:people-ssot-curation-18h-kst`). allowlist 공식/프로필 URL 없는 stub은 강제 승격 금지; empty diff는 commit 없이 no-op.

---

## 5. 스케줄별 절차

### 5.1 `pm-checkpoint`

**스킬:** `leantime-pm` / `factory-pm` · ARCHITECTURE §2.6 #14–15.

1. Gate `flow_active` 실패면 세션 자체가 안 열림.
2. 스캔: In Progress · Review · Deploying* · QA (Blocked/New/Done/Archived는 timebox 대상 아님).
3. **Silence clock:** assignee 실진행 / `nf-progress:` / 완료·blocker만 reset. ladder `@mention`·status-board·mention-outcome은 reset **아님**.
4. **In Progress:** ≈30m; 빈 checkpoint 3회 → `Waiting for Approval` + admin.
5. **Review:** pm 리뷰/머지 작업(self-nudge 금지). ≥2h 무 pm 증거 → Approval 1회. CI-wait는 board만.
6. **Deploy/QA ladder:**  
   ≥2h silence → assignee HC 1회 → ≥1h 무증거 → (assignee=ta면 ARC skip → dead-by-timeout) else `@ta` ARC 1회 → Outcome 1h → alive resume / dead restart·Blocked → **cycle=1** 후 터미널 Approval.
7. **Storm:** lookback 2h 또는 최신 30댓글; mutual agent `@mention`≥8 또는 outcome-seal≥12 → 즉시 터미널, 추가 agent 멘션 금지.
8. Status-board upsert (`<!-- pm-checkpoint-status -->`); actionable만 `add_comment`. ≤5 actionable/run.
9. pm은 kubectl / E2E / 보안 / CD 재실행 금지.

### 5.2 `pm-roadmap-sync`

**스킬:** `factory-pm` `references/roadmap-sync.md`.

1. `.cursor/roadmap-registry.json` (`agents.yaml` `pm.roadmaps[]` + `repos[]`를 seed가 씀).
2. ROADMAP에서 **미완료 `- [ ]`가 있는 첫 `##`만** 현재 마일스톤 — 그 앞 섹션이 열려 있으면 뒤 섹션 티켓 금지.
3. 미완료 `##` 없음 → pass-gate 티켓을 ta|qa|aa 또는 human에 위임.
4. 담당 코멘트 `<!-- roadmap-pass:approved -->` 후에만 다음 `### M{n}` parent 생성 (`next` = passed id+1, 문서 첫 `###` 아님).
5. Dedup 마커 `<!-- roadmap:repo_id:… -->`.
6. **싱크 직후:** current(또는 pass-gate로 enqueue된 next) **마일스톤** 티켓 `status` → `in_progress` (`backlog`/unset만; 하위 task는 유지).

### 5.3 `github-issue-check`

**스킬:** `factory-pm` `references/github-issue-check.md`.

1. `.cursor/github-issues-registry.json` (`repos[]` where `client_id` **and** `project_id`; seed가 pm에 씀). Empty → no-op.
2. 각 엔트리 `gh issue list -R owner/repo --state open`. 신규는 해당 `project_id` 티켓. Dedup `<!-- github-issue:{repo_id}:{n} -->`.
3. 블로커는 기존 티켓에 `add_comment`.
4. Actions/CD 실패 감시는 이 스케줄 범위 아님(→ ta).

### 5.4 `rhwp-batch-upstream-check`

**스킬:** `rhwp-upstream-sync` (`deploy/personas/rhwp_batch`).

1. `gh release view --repo edwardkim/rhwp` latest vs vendored `rhwp/Cargo.toml` version.
2. 같음 + origin에 `v{ver}` 태그 있음 → no-op.
3. 신규 Release → rhwp_batch 프로젝트 티켓 (`<!-- rhwp-upstream:v{ver} -->`). upstream **crate만** `rhwp/`에 복사(Studio/wasm 제외, 무수정). `cargo test -p rhwp-batch` → `git-ship` PR → `@pm`.
4. default branch에 버전이 맞는데 태그가 없으면 `v{ver}` push → `.github/workflows/release.yml` (동일 버전 바이너리·GHCR).
5. 테스트 실패·무수정 충돌 → Blocked + 증거. force-push 금지.

### 5.5 `km-wiki`

[agent-workflows.md § km](agent-workflows.md)와 동일: pull → inbox drain → research → **main 직푸시** → Done/New 티켓. PR·git-ship 금지.

### 5.6 `issue-radar-today`

**스킬:** `issue-radar-today` (`deploy/personas/candidate`). cron `0 23 * * *` UTC = **08:00 KST**.

1. `candidate.win` main pull → `issue_radar.py run` → `publish_today.py`.
2. empty-overwrite: 새 `items=[]`이면 기존 비어 있지 않은 `wiki/data/today.yaml`을 덮어쓰지 않음(exit ≠ 0 / no-op).
3. 커밋 범위는 **`wiki/data/today.yaml`만** (cache·리포트 MD 제외). Leantime write 금지(`--leantime` no-op).
4. 성공 시 `generated_at`+push SHA 증거(Done/Active). 실패 시 New/Active blocker.

### 5.7 `publication-safety`

**스킬:** `publication-safety` (`deploy/personas/candidate`). cron `0 18 * * *` UTC = **03:00 KST**.

1. `candidate.win`에서 `git fetch origin main`. 로컬 `main`이 unpublished Pass 스택으로 diverge면 **`origin/main` detach** 후 게이트만(Pass를 gate에 ff merge 금지).
2. 그 외 `git checkout main && git pull --ff-only`.
3. `python agent/publication_gate.py --base origin/main` — exit 0 = PASS, exit 2 = HOLD(push 금지, slug 목록 티켓).
4. empty-overwrite 준수. Leantime write 금지. clean main(unpublished 비어 HEAD=`origin/main`)이면 push·Hugo 스킵해도 Done.
5. wiki: `Publication-Gate-Empty-Overwrite-Guard`.

### 5.8 `people-ssot-curation`

**스킬:** `people-ssot-curation` (`deploy/personas/candidate`). cron `0 9 * * *` UTC = **18:00 KST**.

1. `candidate.win` fetch; unpublished Pass 스택 diverge면 preserve 백업 후 `origin/main` detach(Pass ff-merge 금지). 그 외 main pull ff-only.
2. allowlisted 공식/프로필 URL(≥1)로 신원·역할이 확인된 stub만 `status: curated` 승격(yaml↔wiki, orphan 0).
3. 안전 출처 없으면 강제 승격 금지 — 잔여 stub·hold 사유 기록(부족≠실패). empty content diff → commit 없음(clean no-op).
4. 금지: Leantime write, `data/issues/*.yaml`·`<!-- human-edit -->` 임의 재작성, host launchd 복구.

### 5.9 `candidate-escalation-drain`

**스킬:** `candidate-escalation` (`deploy/personas/candidate`).

호스트 Pass A(`deep_agent.py --all`, launchd **09:00 KST**)가 저신뢰 stance를 `agent/.cache/escalation/pending.jsonl`에 쌓는다. Factory는 crawl하지 않고 **drain만** 한다.

1. `workspaces/candidate/repos/candidate.win`에서 `git checkout main && git pull --ff-only`.
2. `pending.jsonl` 없거나 비어 있음 → **no-op** (쓰기 없이 종료).
3. 행 단위 재분류 → wiki `<!-- agent:stances -->` (URL 없으면 미기록) → `processed.jsonl` · pending 제거.
4. `git-ship` PR `feature/escalation-drain-YYYYMMDD` + `@pm`. **merge는 pm만**.
5. 금지: `<!-- human-edit -->` 덮어쓰기, `data/issues/*.yaml` 수정, curated people 임의 변경.

### 5.10 `ta-k8s-daily`

- `k8s-operator-operations` **read-only** 리포트.
- mutate/배포 금지. 조치 가능 장애 → client 프로젝트 티켓(`incident-tickets`).
- 현재 live `agents.yaml`에서는 **주석 유지**(eric N, 2026-11-09).

### 5.11 주간 NF (`ta-load-weekly` / `aa-clean-weekly` / `qa-bulk-weekly`)

공통 패턴:

1. `clients-repos-registry.json` 각 엔트리에 `tenant-repo-sync` (ephemeral checkout; primary workspace만 믿지 않음).
2. 테넌트 `.factory/quality.yaml`의 해당 섹션 실행.
3. 실패·High/Med → 해당 **client `project_id`** 에 New 티켓. feature Done을 이 런에서 찍지 않음.
4. **장시간 작업:** 포그라운드 대기 금지. detach/`nohup`/Job + Active/`New`에 `nf-progress:` 하트비트. 하트비트가 있으면 pm은 alive로 보고 **재실행하지 않음**(ARCHITECTURE §2.6 #10).

| id | quality 키 / 스킬 |
|----|-------------------|
| ta-load-weekly | `load` + `load-weekly` |
| aa-clean-weekly | `clean_code` + `clean-code-weekly` (mechanical + heuristic) |
| qa-bulk-weekly | bulk-api / Opik (`bulk-api-probe`, `opik-eval`) |

---

## 6. success_checks · budget

전역(`settings`)과 스케줄별 `success_checks`가 prompt에 soft로 붙는다. v1 runner는 Goose A안으로 hard verify(마지막 Leantime mutation 등) + `success_retry`를 지원했다.

대표 전역 체크:

- Active(또는 선정) 티켓을 쓰기 전에 읽기
- `add_comment` outcome
- Review-ready면 git-ship
- tenant_cd Done = test+qa+aa+prod
- wiki-first + inbox/`wiki: N/A`

`budget.timeout_ms`는 soft preamble — hard kill이 아니며, stall ladder·R1–R5와 별개다.

---

## 7. 일일 운영 cron (스케줄 외, v1)

| CronJob | 시각 | 역할 |
|---------|------|------|
| `cursorbridge-schedule-tick` | `* * * * *` UTC | schedules + Ready catch-up |
| `cursorbridge-agent-restart` | `0 15 * * *` UTC | MEMORY/mcp dump → STS restart → 출근 catch-up |
| chat retention / spend-alert | (별도) | PVC chats 보관 · token spend 티켓 |

---

## 8. main 이식 체크리스트 (A8)

- [x] `agents.yaml` `settings.schedules` 로드 (`agent/shared/load-config`)
- [x] gateway 로컬 cron이 due+gates 평가 (Worker Cron 없음)
- [x] 티켓리스 prompt → cursor `POST /sessions` (persona별)
- [x] `(schedule_id, minute)` dedupe
- [x] `flow_active` / `in_progress` 게이트를 D1 `GET /api/agent/flow-gates`로 재구현
- [x] catch-up과 스케줄 분리 유지 (기동 시 catch_up 1회)
- [x] NF 장시간: `nf-progress:` 계약 유지 (스킬)
- [x] persona prompt/스킬은 [../personas/](../personas/) · [agent-workflows.md](agent-workflows.md)와 정합

