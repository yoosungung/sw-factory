---
name: agent-catch-up
description: >-
  Runner Ready 직후(재기동=출근) catch-up 세션에서 배정함·멘션을 훑고 할 일 한 건을
  선별해 착수한다. catch_up 프롬프트, commute, Ready-edge, lookback_since 사용 시 적용.
---

# Agent Ready Catch-up (출근)

프롬프트에 **Active ticket_id가 없다**. 이 세션은 triage + **한 건 착수**용이다. 역할 전용 주기 작업(PM checkpoint, TA CD, 주간 NF 등)은 기존 `schedules[]`/스킬에 맡긴다.

`MEMORY.md` / `bridge.json`의 내 `leantime_user_id`를 **me**로 쓴다.

## Lookback

프롬프트 `{lookback_since}`(ISO) 이후만 본다. 없으면 **지금 − 48h**.

## 절차

1. **배정함:** `list_tickets(assigned_to=me)`. Done/Archived 제외. 우선순위:
   - (a) `In Progress` + lookback 이후 새 맥락(코멘트/수정)
   - (b) `Blocked`이지만 내가 풀 수 있는 것
   - (c) `New` / Todo 등 열린 배정
2. **멘션:** `list_tickets(updated_since=lookback_since)`로 후보를 좁힌 뒤, 각 티켓에 `get_comments(module=ticket, module_id=…, mentioned_user_id=me, since=lookback_since)`. 멘션 **이후**에 내가 이미 응답 코멘트를 남긴 스레드는 스킵.
3. **선별:** actionable 한 건만. `Waiting for Approval`·사람 전용(@eric 시크릿/범위 판단)은 스킵(PM 레인과 충돌 시 PM에 맡김).
4. **착수:** 선정 티켓을 이 세션에서 `get_ticket` / `get_comments` 후 역할 스킬대로 진행. 진행·결정은 `add_comment`(HTML 줄바꿈·멘션 규칙은 `leantime-collab`).
5. **무업무:** 티켓에 스팸 코멘트 없이 종료.

## 하지 말 것

- 한 세션에서 여러 티켓을 병렬로 크게 진행하지 않는다(한 건 착수 후 필요 시 다음 Ready/이벤트에 맡긴다).
- Active-ticket 이벤트 세션처럼 “다른 티켓 금지”를 이 catch-up에 적용하지 않는다 — triage 범위는 배정/멘션 큐 전체다.
- 이미 처리된 멘션을 자동 재재생한다고 가정하지 않는다.
