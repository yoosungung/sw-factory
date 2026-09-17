# Schedules 흐름 (v1 참고)

출처: `v1` `ARCHITECTURE.md` §1.5 · §2.4 · §2.6 #10/#15, `ScheduleTicker` / `DefaultScheduleGates`, `deploy/k8s/base/cronjob-schedule-tick.yaml`, 실정 스냅샷 [../agents.back.yaml](../agents.back.yaml) · sample `deploy/k8s/agents.yaml.sample`.

**main:** gateway `schedules[]`는 [ROADMAP A8](../../ROADMAP.md) **planned**. 이 문서는 v1 동작을 정본으로 남겨 A8 이식 시 그대로 맞춘다. catch-up은 gateway 기동 경로로 이미 유사 이식됨.

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
| `pm-roadmap-sync` | `0 22 * * *` | 07:00 | pm | — | ROADMAP current 1섹션 / pass-gate |
| `github-issue-check` | `0 23 * * *` | 08:00 | *(all bots)* | — | GH Issue → client 티켓 |
| `km-wiki` | `30 23 * * *` | 08:30 | km | — | inbox drain + research → main |
| `ta-k8s-daily` | `0 1 * * *` | 10:00 | ta | — | k8s read-only 리포트 |
| `ta-load-weekly` | `0 2 * * 1` | 월 11:00 | ta | — | 주간 load (tenant quality) |
| `aa-clean-weekly` | `30 2 * * 1` | 월 11:30 | aa | — | 주간 clean-code |
| `qa-bulk-weekly` | `0 3 * * 1` | 월 12:00 | qa | — | 주간 bulk/Opik |

`github-issue-check`는 sample에서 `agents` 생략 → 전 bot에 발사될 수 있음. 운영 스냅샷(`agents.back.yaml`)도 agents 생략. 이식 시 **담당 persona를 명시**하는 편이 안전하다.

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

1. `.cursor/roadmap-registry.json`의 enabled repo.
2. ROADMAP에서 **미완료 `- [ ]`가 있는 첫 `##`만** 현재 마일스톤 — 그 앞 섹션이 열려 있으면 뒤 섹션 티켓 금지.
3. 미완료 `##` 없음 → pass-gate 티켓을 ta|qa|aa 또는 human에 위임.
4. 담당 코멘트 `<!-- roadmap-pass:approved -->` 후에만 다음 `### M{n}` parent 생성 (`next` = passed id+1, 문서 첫 `###` 아님).
5. Dedup 마커 `<!-- roadmap:repo_id:… -->`.

### 5.3 `github-issue-check`

- 신규 GitHub Issue → **client 프로젝트** 티켓(QA가 재현·시나리오 등록 가능하도록).
- 블로커는 `add_comment`.
- Actions/CD 실패 감시는 이 스케줄 범위 아님(→ ta).

### 5.4 `km-wiki`

[agent-workflows.md § km](agent-workflows.md)와 동일: pull → inbox drain → research → **main 직푸시** → Done/New 티켓. PR·git-ship 금지.

### 5.5 `ta-k8s-daily`

- `k8s-operator-operations` **read-only** 리포트.
- mutate/배포 금지. 조치 가능 장애 → client 프로젝트 티켓(`incident-tickets`).

### 5.6 주간 NF (`ta-load-weekly` / `aa-clean-weekly` / `qa-bulk-weekly`)

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

- [ ] `agents.yaml` `settings.schedules` 로드 (`agent/shared/load-config`)
- [ ] gateway 로컬 cron 또는 Worker Cron이 due+gates 평가
- [ ] 티켓리스 prompt → cursor `POST /sessions` (persona별)
- [ ] `(schedule_id, minute)` dedupe
- [ ] `flow_active` / `in_progress` 게이트를 D1 쿼리로 재구현
- [ ] catch-up과 스케줄 분리 유지
- [ ] NF 장시간: `nf-progress:` 계약 유지
- [ ] persona prompt/스킬은 [../personas/](../personas/) · [agent-workflows.md](agent-workflows.md)와 정합

구현 전 `v1` `ScheduleTicker`·`DefaultScheduleGates`·`tick-schedules.php`를 다시 대조한다.
