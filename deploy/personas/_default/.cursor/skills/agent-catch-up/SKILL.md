---
name: agent-catch-up
description: >-
  티켓리스 catch-up 세션에서 assignee/멘션 actionable 1건을 고른 뒤 그 티켓만 작업한다.
---

# Catch-up

Active `ticket_id`가 없을 때:

1. `list_tickets`(me/assignee) 또는 `search`로 후보를 본다
2. **최대 1건**만 선택 (없면 쓰기 없이 종료)
3. 선택 후 그 티켓을 Active로 취급 — `factory-collab` 규칙 적용
4. 여러 건이 actionable이면 우선순위(블로커·멘션·마감)로 1건만 고르고 나머지는 코멘트에 목록만
