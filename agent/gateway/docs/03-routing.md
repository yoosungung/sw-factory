# Routing (CursorBridge Router 이식)

gateway만 라우팅한다. cursor는 “누구 몫인지”를 다시 판단하지 않는다.

## 정본 규칙 (GH §1.6 · §2.6 축약)

1. **대상** — `type=sessions` persona의 factory `user_id`가 assignee이거나 @mention된 경우. **`assignee_user_id`가 null(Unassigned)이면 `persona: pm`으로 triage 배달.**
2. **self-echo** — bot이 **자기 담당 티켓**에 남긴 이벤트는 그 bot으로 재디스패치하지 않는다. 다른 bot·human 이벤트는 전달.
3. **human** — `type=human`은 prompt 대상 아님.
4. **Active ticket 스코프** — 이벤트 prompt에 `Active ticket_id=…`를 붙여 MCP 읽기/쓰기를 해당 티켓으로 유도. `catch_up`·스케줄(티켓리스)에는 붙이지 않음.
5. **mention** — 코멘트 body의 `@email` 또는 structured mention → 해당 persona.
6. **handoff** — assignee 변경 시 신규 assignee에 handoff prompt; 이전 sticky는 cursor가 티켓 뮤텍스·매핑으로 정리.
7. **catch-up (재기동=출근)** — GH는 Bridge가 `/readyz` false→true 프로브. 여기선 Worker가 내부망을 프로브할 수 없으므로 **gateway 기동(또는 cursor `/readyz` 로컬 true 전이)** 시 `prompts.catch_up` 1회. lookback=`last_catch_up_at` 또는 now−48h.

## prompts 템플릿 키

`agents.yaml` / 설정: `ticket_created`, `ticket_updated`, `comment_added`, `assignee_changed`, `mention`, `handoff`, `catch_up`.

gateway는 템플릿에 `{ticket_id}`, `{lookback_since}` 등만 치환하고 **티켓 본문을 가져오지 않는다**. 본문·맥락은 cursor가 MCP로 읽는다.

## 스케줄

주기 작업은 (a) Worker Cron이 log에 `schedule_tick`을 append하거나 (b) gateway 로컬 cron이 티켓리스 prompt를 cursor에 직접 넣는다. 어느 쪽이든 **inference wake의 오케스트레이션 책임은 gateway**; cursor는 자체 cron으로 티켓을 훑지 않는다(GH §1.5와 동일 정신).
