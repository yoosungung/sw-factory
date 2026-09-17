---
name: factory-collab
description: >-
  factory-mcp로 티켓·코멘트를 읽고 업데이트한다. get_ticket, get_comments,
  add_comment, edit_comment, set_blocked_by, update_ticket, list_tickets,
  list_project_members, search 사용 시 적용한다.
---

# Factory MCP 협업

MCP 서버 `factory` 도구를 사용한다. 작업 전 읽기, 작업 후 코멘트·상태 갱신(해당 시)이 필수다.

## 티켓 스코프 (필수)

이벤트 프롬프트에 `Active ticket_id=…`가 있으면 **그 id만** 작업 대상이다.

- 읽기: `get_ticket`, `get_comments`
- 쓰기: `add_comment` / `update_ticket`의 `ticket_id`는 **항상 Active**
- 세션에 다른 티켓이 나와도 사용자가 다른 id를 명시하지 않는 한 쓰지 않는다.

**예외 — catch-up / 티켓리스 세션:** Active가 없다. `agent-catch-up`으로 actionable **1건**을 고른 뒤 그 티켓에만 읽고 쓴다.

## 작업 전

1. `get_ticket`(Active)
2. `get_comments`(Active)
3. 필요 시 `list_tickets` / `search` / `get_project` / `list_project_members`(lane 배정)로 범위 확인

## 작업 중

- 진행·결정은 `add_comment` 우선
- 본문·담당자·상태는 필요할 때만 `update_ticket`(+ `version`)
- `@mention`은 **지금 실행할 액션이 있는 상대**에게만

| 상황 | 쓰기 |
|------|------|
| 핸드오프·재작업 등 **지금** 상대 할 일 | `add_comment` + `@mention` + (필요 시) assignee |
| CI pending / standby / “나중에 @x” | 침묵 또는 무멘션 상태만 |
| 새 증거 없이 같은 대기 | 코멘트·멘션 없이 종료 |

## 작업 후

1. 진전·핸드오프가 있으면 Active에 `add_comment` 요약
2. 구현 완료 → 리뷰 의도 → `done` 경로로 올릴 때 같은 `ticket_id`로 `update_ticket`
3. 증거 마커: `test:`, `qa:`, `aa:`, `prod:` (해당 시)

## 도구 요약

| 도구 | 용도 |
|------|------|
| `get_ticket` | 티켓 상세 |
| `get_comments` | 코멘트 |
| `add_comment` | 코멘트 추가 (멘션 웨이크) |
| `edit_comment` | 코멘트 수정 (웨이크 없음; status-board upsert) |
| `set_blocked_by` | description `<!-- blocked-by:uuid[,uuid] -->` |
| `update_ticket` | 필드·상태·담당자 |
| `list_tickets` | 프로젝트 티켓 목록 (`milestone_id` = parent 자식) |
| `search` | 검색 |
| `list_projects` / `get_project` | 프로젝트 |
