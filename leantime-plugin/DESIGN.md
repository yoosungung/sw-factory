# leantime-plugin (CursorBridge)

Leantime 플러그인 — EventDispatcher 훅, Router, SessionStore, `sessions`/`openai` runner dialect.

## 내부 구조

```
Listener.php, Router.php, SessionStore.php, …
RunnerClient.php          # type=sessions (/sessions)
OpenAIRunnerClient.php    # type=openai (/v1/responses, fire-and-forget)
DelegatingRunnerClient.php
Services/CursorBridge.php
CreatedByMeTickets.php    # My Work “Created by me” query (author + open/Done≤5d)
WidgetDefaults.php        # available/defaultWidgets + dashboardGrid swap
Hxcontrollers/CreatedByMe.php
Templates/partials/createdByMe.blade.php
Language/en-US.ini
tests/
```

### My Work widget (Created by me)

`register.php`가 `availableWidgets` / `defaultWidgets` 필터로 위젯을 등록하고 **기본 Calendar 슬롯을 대체**한다(카탈로그의 Calendar는 유지 → 설정에서 다시 켤 수 있음). 목록: `userId`=현재 사용자, milestone/subtask 제외, `status≠0` 또는 Done(`0`)이면서 `zp_tickethistory` 종료 시각(없으면 `modified`)이 5일 이내.

저장된 그리드 마이그레이션:

```bash
kubectl -n sw-factory exec deploy/leantime -- \
  php /var/www/html/app/Plugins/CursorBridge/bin/migrate-created-by-me-widget.php --dry-run
kubectl -n sw-factory exec deploy/leantime -- \
  php /var/www/html/app/Plugins/CursorBridge/bin/migrate-created-by-me-widget.php
```

## Commands

```bash
cd leantime-plugin
composer install
./vendor/bin/phpunit
```

Leantime 설치 경로: `app/Plugins/CursorBridge/` (이 디렉터리 복사).

### Deploy monkey patch (알림 coalesce)

운영 배포(`scripts/install-plugin-k8s.sh`)는 Leantime **3.9.7** core
`app/Domain/Notifications/Repositories/Notifications.php`를
`patches/3.9.7/NotificationsRepository.php`로 **subPath 덮어쓴다**.

동작: 티켓 URL(`tickets/showTicket/{id}`)이 있는 in-app 알림은
`(userId, ticketId)`당 1행. 이후 댓글/멘션은 insert 대신 해당 행을
다시 unread로 갱신(`NotificationCoalesce`). 헬퍼는 플러그인 디렉터리에 설치된다.

기존 DB 중복 정리(원샷):

```bash
kubectl -n sw-factory exec deploy/leantime -- \
  php /var/www/html/app/Plugins/CursorBridge/bin/dedupe-ticket-notifications.php --dry-run
kubectl -n sw-factory exec deploy/leantime -- \
  php /var/www/html/app/Plugins/CursorBridge/bin/dedupe-ticket-notifications.php
```

Leantime 이미지 메이저/마이너 올리면 패치 파일을 재검토한다.

주기 프롬프트: `bin/tick-schedules.php` (`Plugin::tickSchedules()`). CLI는 `bin/leantime`과 같이 `LEAN_CLI` + `bootstrap/app.php` + ConsoleKernel boot 후 게이트를 평가한다(미부트 시 `Tickets`/`DB` DI 실패 → fail-closed). 설정은 `bridge.json` `schedules[]`. 선택 `gates[]`(AND; 생략 가능) — `in_progress`는 `zp_tickets.status=4`, `flow_active`는 status∈{4,10,11,12,13}(공장 기본 dual-loop 보드) 존재 여부(DB; 세션 ACL 우회)를 본 뒤 세션을 만든다.

`type=openai` runner는 env `CURSORBRIDGE_OPENAI_API_KEY` 필요.

`composer.json`에 **`version` 필수** — 없으면 My Apps 목록이 비어 보임. Leantime PSR-4는 `app/Plugins/{Folder}/` 기준이므로 클래스는 `src/`가 아닌 플러그인 루트·`Services/`에 둔다.
