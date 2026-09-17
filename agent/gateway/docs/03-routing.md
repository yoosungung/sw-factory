# Routing (CursorBridge Router 이식)

gateway만 라우팅한다. cursor는 “누구 몫인지”를 다시 판단하지 않는다.

## 정본 규칙 (GH §1.6 · §2.6 축약)

1. **대상** — `type=sessions` persona의 factory `user_id`가 assignee이거나 @mention된 경우. **`assignee_user_id`가 null(Unassigned)이면 `persona: pm`으로 triage 배달.**
2. **self-echo** — bot이 **자기 담당 티켓**에 남긴 이벤트는 그 bot으로 재디스패치하지 않는다. 다른 bot·human 이벤트는 전달.
3. **human** — `type=human`은 prompt 대상 아님.
4. **Active ticket 스코프** — 이벤트 prompt에 `Active ticket_id=…`를 붙여 MCP 읽기/쓰기를 해당 티켓으로 유도. `catch_up`·스케줄(티켓리스)에는 붙이지 않음.
5. **mention** — Worker가 코멘트 body의 `@user.name`(case-insensitive, project member)을 `payload.mention_user_ids`로 넣음 → 해당 persona.
6. **handoff** — assignee 변경 시 신규 assignee에 handoff prompt; 이전 sticky는 cursor가 티켓 뮤텍스·매핑으로 정리.
7. **catch-up (재기동=출근)** — gateway **프로세스 기동 시** `prompts.catch_up` 1회 (`type=sessions`). lookback=`last_catch_up_at` 또는 now−48h. `/readyz` 폴링은 하지 않음.

## prompts 템플릿 키

`agents.yaml` / 설정: `ticket_created`, `ticket_updated`, `comment_added`, `assignee_changed`, `mention`, `handoff`, `catch_up`.

gateway는 템플릿에 `{ticket_id}`, `{lookback_since}` 등만 치환하고 **티켓 본문을 가져오지 않는다**. 본문·맥락은 cursor가 MCP로 읽는다.

## 스케줄

`settings.schedules[]`는 **gateway 로컬 cron**(UTC 분 틱)이 due+gates를 평가하고 cursor `POST /sessions` `{ ticket_id: null }`로 발사한다. Worker Cron / `schedule_tick` outbox는 쓰지 않는다. 미지원 gate는 fail-closed. `flow_active` / `in_progress`는 `GET /api/agent/flow-gates`. sticky에 올리지 않으며 `(schedule_id, YYYY-MM-DDTHH:MM)` 파일 dedupe. cursor는 자체 cron으로 티켓을 훑지 않는다.
