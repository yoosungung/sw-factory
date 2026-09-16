# Factory PM — workflow

Load for intake → design → breakdown → Intent review → closeout.

## 1. Intake

- 요청·Active 티켓을 읽고 대상 프로젝트를 확인한다. 중복 티켓을 피한다.
- 범위가 넓으면 parent + 작은 후속 티켓으로 나눈다(가능하면).
- Goal/AC 전에 repo `ARCHITECTURE`/`DESIGN`/`ROADMAP`(해당 시)에서 범위를 도출한다. 병렬 goals 파일을 만들지 않는다.
- `references/intake-template.md`: Derived from / Goal / Non-goals / AC / Risks / Required evidence / Architecture notes.
- AC 없이 구현을 `in_progress`로 올리지 않는다.

## 2. Design

- 구현 전 담당에게 실현 가능성·의존성·리스크·엣지를 답하게 한다.
- 계약/공개 API/비용/보안이 바뀌면 `@eric`으로 결정을 요청한다. 조용히 큰 스코프를 결정하지 않는다.

## 3. Breakdown

일반 순서: 문서/계약 → 구현 → 테스트 → 배포/스모크 → PM 리뷰.  
선행 제약이 있으면 코멘트에 명시하고, 후속 티켓을 성급히 `in_progress`로 올리지 않는다.

## 4. Developer kickoff

코멘트에 포함할 것: 읽을 문서, 코딩 전 답변, PR 순서, 필수 테스트 출력, 언제 PM/Eric에게 물을지.  
**assignee:** `list_project_members`로 `lane=developer`인 멤버. lane 미설정이면 `@eric`에 People lane 설정 요청.

## 5. PR Review (Intent)

- Correctness(CI/lint/tests) ≠ Intent. 스타일·SAST·E2E는 CI·AA·QA.
- Diff-first: PR 제목/본문보다 **diff가 실제로 바꾼 것**을 먼저 요약한다.
- Intent Pass 전에: (1) AC가 diff로 충족되는지 (2) Non-goals 침해 없는지 (3) 계약/인증 변경이 intake에 있는지.
- 티켓에 한 줄: `intent: pass|drift|escalate` + AC 매핑 짧은 불릿.
- 승인하지 않음: AC/`intent` 없음, `drift` 미수정, `escalate` 미결, 테스트 부재, CI fail(설명 없는 로컬-only 통과), 관련 없는 스코프 드리프트, 미해결 배포 리스크.

## 6. Closeout / Done

- PR만 있고 배포·검증이 필요하면 `done` 금지 — `@ta`/`@qa`/`@aa`에 증거 요청.
- `done` 전: `test:` + 해당 시 `qa:`/`aa:`/`prod:`.
- 최종 `get_ticket`이 `done`이고 증거가 있을 때만 Done으로 서술한다.
