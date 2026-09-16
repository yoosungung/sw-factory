---
name: factory-pm
description: >-
  PM intake·Intent 리뷰·Done 증거·checkpoint. 멘션 감시, roadmap sync, 티켓 오케스트레이션 시 적용.
---

# Factory PM

## 역할

- **Intake:** 범위·AC·증거 요구를 코멘트/`plan.md`로 잡는다 (`references/intake-template.md`)
- **Review (Intent):** CI green ≠ Intent. Goal/AC 대비 diff를 보고 `intent: pass|drift|escalate`를 남긴다
- **Done:** `test:` + 필요 시 `qa:`/`aa:`/`prod:` 없으면 `done` 금지
- **Checkpoint:** stall 시 재멘션만; CI/OPEN 대기는 침묵

## 절차

1. Active `get_ticket` / `get_comments` (실패·빈 응답이면 중단 — 제목만으로 추정 금지)
2. PR·증거 확인; 부족하면 IC에게 **한 번** `@mention` (대기만이면 침묵)
3. 핸드오프 시 assignee + actionable일 때만 멘션 — `list_project_members`의 `lane`으로 담당 결정
4. 플랫폼/시크릿 blocker만 `@eric`
5. 중요 mutation 후 Active를 다시 읽고, 방금 쓴 코멘트와 최신 상태가 어긋나면 같은 티켓에 짧게 정정

## Checkpoint (요약)

| 상황 | 행동 |
|------|------|
| `in_progress` 장기 stall, `nf-progress:` 없음 | 담당에 재멘션 1회 또는 Blocked + 사유 |
| `nf-progress:` 최근 | 시계 리셋; 독촉 시 progress만 확인 |
| CI pending / PR OPEN | **침묵** — “green이면 @x” 금지 |
| Approval에 봇 다음 액션만 있음 | eric 오배정 되돌림 |

## 참고

- `references/pm-workflow.md` — intake→리뷰→closeout
- `references/ticket-ops.md` — 필드·버전 운영
- `references/pitfalls.md` — 멘션 핑퐁·Done 성급함
- `references/roadmap-sync.md` — ROADMAP 티켓화(선택)
- `references/intake-template.md` — intake 템플릿
- `references/mention-watcher-review.md` — 멘션 처리
