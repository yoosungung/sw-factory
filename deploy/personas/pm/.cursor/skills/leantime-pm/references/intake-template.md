# Intake / architecture / sprint-lite (M8)

제품 vision·스프린트 도구는 테넌트/Leantime 보드에 둔다. 공장 ROADMAP에 제품 기능을 적지 않는다. 테넌트 repo의 `ROADMAP.md`는 `repos[].roadmap.enabled`일 때 pm `pm-roadmap-sync`가 **current 마일스톤 1개만** 티켓화하고, current가 모두 `[x]`이면 **pass-gate** 위임 후 승인 시에만 다음 마일스톤 티켓을 연다(`references/roadmap-sync.md`).

## Intent hierarchy (SoR)

| 층 | SoR | 용도 |
|----|-----|------|
| Project | 테넌트 `ARCHITECTURE.md` / `DESIGN.md` + (있으면) `ROADMAP` **current** `##` | 장기 제약·이번 마일스톤 범위 |
| Ticket | 아래 Intake 섹션 (Goal / Non-goals / AC) | **이번 변경의 intent** — Review Intent Pass 정본 |
| PR | diff + checks | 증거; 작성자 주장 문장은 2순위 |

별도 `PROJECT_GOALS.md`를 만들지 않는다. Project 층은 기존 L0·roadmap에 Goal/Non-goals를 두고, intake가 그걸 **한 티켓 분량으로 내린 결과**다. Project와 티켓이 어긋나면 티켓을 고치거나 `@eric` — diff에 맞춰 project를 재해석하지 않는다.

## Intake (부모 티켓 필수 섹션)

티켓 본문 또는 첫 PM 코멘트에 아래를 **모두** 채운 뒤에만 구현 서브태스크를 In Progress로 둔다.

```text
## Derived from
<!-- e.g. ROADMAP.md##current-slug · ARCHITECTURE.md§N · DESIGN.md§… · N/A — ad-hoc -->
## Goal
## Non-goals
## Acceptance criteria
## Risks / open questions
## Required test / deploy evidence
## Architecture notes (or "N/A — no contract change")
```

- **Derived from** — project SoR 링크(또는 N/A). Intake 전에 해당 파일을 읽고 Goal/Non-goals/AC를 **유도**한다(복붙 장문 금지).
- 수용 기준이 없으면 개발 배정·In Progress 금지.
- Eric 승인이 필요한 큰 계약 변경은 Architecture notes + `@eric`.

## Architecture proposal

별도 서비스 없음. 계약·스키마·이벤트 변경은:

1. 티켓 `Architecture notes` 섹션에 제안
2. 해당 테넌트 또는 공장 repo의 `ARCHITECTURE.md`/`DESIGN.md` 패치가 필요하면 서브태스크로 명시
3. 비용·공개 API·데이터 레이아웃 영향 시 Eric 승인 게이트

## Sprint-lite

- pm `pm-checkpoint`가 dual-loop 활성 흐름(`In Progress`·`Review`·`Deploying*`·`QA`)을 감시. Deploy/QA stall **closed-loop**(ARCHITECTURE §2.6 #15): ≥2h → HC 1회; +1h → ARC 1회(또는 assignee=ta면 skip) → Outcome SLA 1h/dead-by-timeout → cycle=1 후 Approval+admin. ARC 무한 re-nudge 금지.
- 벨로시티·스프린트 전용 도구를 공장에 만들지 않음.
- 주간 범위는 Leantime 보드/필터 관례로만.
