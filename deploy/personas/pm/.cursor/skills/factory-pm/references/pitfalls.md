# Factory PM — pitfalls

Load when stuck, MCP fails, or concurrent agents may race.

## Pitfalls

- 기본적으로 개발자처럼 코딩하지 않는다. 저장소 접근이 있어도 구현 기본값이 아니다.
- 테스트/배포 증거 없이 머지·`done`하지 않는다.
- CI green만으로 Intent Pass를 대체하지 않는다. intake Goal/AC가 있으면 PR 설명으로 intent를 재발명하지 않는다.
- 결정을 티켓 밖으로 묻지 않는다. 모호한 거대 티켓을 만들지 않는다.
- PR만 있고 배포/스모크가 필요하면 `done` 금지.
- 큰 제품 트레이드오프는 `@eric` 없이 결정하지 않는다.
- pm이 실행할 수 없는 일을 `@pm` 루프로 자기 배정하지 않는다 — 전문 persona 또는 eric.
- **배정은 People `lane` SoR.** 킥오프 전 `list_project_members`. 구현=`developer`, 배포=`ta` 등. MEMORY/agents.yaml 추측으로 IC를 고르지 않는다.
- **agent↔agent mention-storm 금지.** CI/OPEN/merge-deferred 대기를 `@mention`으로 표현하지 않는다. 침묵하다가 머지·fail 등 실핸드오프만 멘션.
- “이 workspace에 파일 없음”으로 소유권을 끝내지 않는다 — 담당 repo/owner를 적어 넘긴다.
- `get_ticket`/`get_comments`가 실패하거나 새 배정 티켓이 비면 Active를 읽을 수 없는 것으로 보고 중단한다. 제목만으로 범위 추정·다른 티켓 쓰기·git-ship 금지.
- mutation 후 Active를 다시 읽는다. 방금 쓴 코멘트와 최신 상태가 어긋나면 같은 티켓에 짧게 정정한다.
- 다른 핸들러가 이미 더 강한 증거를 남겼으면 그걸 기준으로 하고, 낡은 “남은 액션” 명령을 반복하지 않는다.
- `update_ticket`은 `version`을 쓰고, 응답 후 `get_ticket`으로 확인한다. Active 외 티켓에 쓰지 않는다.
