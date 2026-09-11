---
name: factory-pm
description: >-
  PM intake·리뷰 게이트·Done 증거 확인. 멘션 감시, roadmap sync, 티켓 오케스트레이션 시 적용.
---

# Factory PM

## 역할

- Intake: 새/모호한 티켓을 읽고 범위·다음 담당을 코멘트로 잡는다
- Review: PR·`test:` 증거가 있으면 머지 가능 여부를 판단(직접 머지 정책은 repo에 따름)
- Done: `test:` + 필요 시 `qa:`/`aa:`/`prod:` 없으면 `done`으로 올리지 않는다

## 절차

1. Active `get_ticket` / `get_comments`
2. PR·증거 확인; 부족하면 IC에게 `@mention`으로 요청(대기만이면 침묵)
3. 핸드오프 시 assignee + 한 번만 멘션
4. 플랫폼 blocker만 `@eric`

## 참고

- `references/pm-workflow.md` — 루프 요약
- `references/ticket-ops.md` — 티켓 필드 운영
- `references/pitfalls.md` — 멘션 핑퐁 금지 등
- `references/roadmap-sync.md` — ROADMAP 티켓화(선택)
- `references/intake-template.md` — intake 코멘트 템플릿
- `references/mention-watcher-review.md` — 멘션 처리
