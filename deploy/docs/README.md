# deploy/docs — 공장 운영 참고 (v1 정본 이식)

`v1` 브랜치(Leantime + CursorBridge + agent-runner)의 **동작·운영 의도**를 정리한 참고 문서다.  
계약 정본은 루트 [ARCHITECTURE.md](../../ARCHITECTURE.md), persona 실행 세부는 [../personas/](../personas/), 배달 런타임은 [agent/gateway](../../agent/gateway/)·[agent/cursor](../../agent/cursor/).

| 문서 | 내용 |
|------|------|
| [agent-workflows.md](agent-workflows.md) | pm / ta / aa / qa / km / developer 작업 흐름·규칙 |
| [schedules.md](schedules.md) | `schedules[]` 틱·게이트·스케줄별 절차·catch-up |

**스택 매핑 (main):**

| v1 | main (현재) |
|----|-------------|
| Leantime + CursorBridge | Workers/D1 + `agent/gateway` |
| agent-runner | `agent/cursor` |
| HTML Tiptap `@mention` | Markdown `@Name` → `mention_user_ids` ([ARCHITECTURE](../../ARCHITECTURE.md) Comment @mention) |
| `schedules[]` + CronJob tick | **A8 planned** ([ROADMAP](../../ROADMAP.md)); 스냅샷은 [../agents.back.yaml](../agents.back.yaml) |
| `bridge.json` `leantime_user_id` | `agents.yaml` `user_id` (factory `users.id`) |

갭·의도적 생략은 각 문서 하단에 적는다. Leantime/PHP 경로를 그대로 복사하지 않는다 — 의도·시퀀스·운영 패턴만 이식한다.
