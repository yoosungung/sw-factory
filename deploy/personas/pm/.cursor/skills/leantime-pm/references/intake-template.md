# Intake / architecture / sprint-lite (M8)

제품 vision·스프린트 도구는 테넌트/Leantime 보드에 둔다. 공장 ROADMAP에 제품 기능을 적지 않는다. 테넌트 repo의 `ROADMAP.md`는 `repos[].roadmap.enabled`일 때 pm `pm-roadmap-sync`가 **current 마일스톤 1개만** 티켓화하고, current가 모두 `[x]`이면 **pass-gate** 위임 후 승인 시에만 다음 마일스톤 티켓을 연다(`references/roadmap-sync.md`).

## Intake (부모 티켓 필수 섹션)

티켓 본문 또는 첫 PM 코멘트에 아래를 **모두** 채운 뒤에만 구현 서브태스크를 In Progress로 둔다.

```text
## Goal
## Non-goals
## Acceptance criteria
## Risks / open questions
## Required test / deploy evidence
## Architecture notes (or "N/A — no contract change")
```

수용 기준이 없으면 개발 배정·In Progress 금지. Eric 승인이 필요한 큰 계약 변경은 Architecture notes + `@eric`.

## Architecture proposal

별도 서비스 없음. 계약·스키마·이벤트 변경은:

1. 티켓 `Architecture notes` 섹션에 제안
2. 해당 테넌트 또는 공장 repo의 `ARCHITECTURE.md`/`DESIGN.md` 패치가 필요하면 서브태스크로 명시
3. 비용·공개 API·데이터 레이아웃 영향 시 Eric 승인 게이트

## Sprint-lite

- pm `pm-checkpoint`가 dual-loop 활성 흐름(`In Progress`·`Review`·`Deploying*`·`QA`)을 감시. Deploy/QA stall 사다리: ≥2h → assignee health-check; +1h 무응답 → `@ta` assignee-runtime-check (실행 대행 금지).
- 벨로시티·스프린트 전용 도구를 공장에 만들지 않음.
- 주간 범위는 Leantime 보드/필터 관례로만.
