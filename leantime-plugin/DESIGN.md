# leantime-plugin (CursorBridge)

Leantime 플러그인 — EventDispatcher 훅, Router, SessionStore, `sessions`/`openai` runner dialect.

## 내부 구조

```
Listener.php, Router.php, SessionStore.php, …
RunnerClient.php          # type=sessions (/sessions)
OpenAIRunnerClient.php    # type=openai (/v1/responses, fire-and-forget)
DelegatingRunnerClient.php
Services/CursorBridge.php
tests/
```

## Commands

```bash
cd leantime-plugin
composer install
./vendor/bin/phpunit
```

Leantime 설치 경로: `app/Plugins/CursorBridge/` (이 디렉터리 복사).

주기 프롬프트: `bin/tick-schedules.php` (`Plugin::tickSchedules()`). 설정은 `bridge.json` `schedules[]`. 선택 `gates[]`(AND; 생략 가능) — `in_progress`는 Leantime Tickets로 top·sub `status=4` 존재 여부를 본 뒤 세션을 만든다.

`type=openai` runner는 env `CURSORBRIDGE_OPENAI_API_KEY` 필요.

`composer.json`에 **`version` 필수** — 없으면 My Apps 목록이 비어 보임. Leantime PSR-4는 `app/Plugins/{Folder}/` 기준이므로 클래스는 `src/`가 아닌 플러그인 루트·`Services/`에 둔다.
