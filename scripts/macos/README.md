# macOS LaunchAgents (KeepAlive)

Native cursor + gateway를 **로그인 세션 LaunchAgent**로 등록한다. 프로세스 크래시 시 launchd가 재기동한다 (`KeepAlive`, `ThrottleInterval=15`).

추가로:

- **`git-head-watch`** — `git rev-parse HEAD` 폴링, pull/checkout 등으로 HEAD가 바뀌면 cursor+gateway 재기동 (자동 `git pull` 없음).
- **`daily-restart`** — 매일 로컬 시각 **04:00**(기본)에 cursor+gateway 위생 재기동. 장수 프로세스·SDK 좀비 세션 누적을 줄인다.

재기동 시 gateway `sticky.json`을 비운다 (in-memory agent_id는 프로세스와 함께 무효). SDK active-run 실패 시 cursor가 세션 맵에서 제거해 다음 dispatch가 404→rebind 한다 ([agent/cursor/DESIGN.md](../../agent/cursor/DESIGN.md)).

Docker/k8s 감독의 대체는 아니다 — MacBook에서 `local:run` 대신 상시 돌릴 때용.

## 전제

- `npm install` 완료
- [`deploy/local/.env`](../../deploy/local/)에 `FACTORY_BASE_URL`, `GATEWAY_SESSION_COOKIE`, (실 SDK면) `CURSOR_API_KEY`
- [`deploy/agents.yaml`](../../deploy/agents.yaml) 존재
- **`npm run local:run`과 동시 사용 금지** (같은 `:8080` / data-dir)

## 명령

```bash
# from repo root
./scripts/macos/install-launchagents.sh
./scripts/macos/uninstall-launchagents.sh
./scripts/macos/restart-launchagents.sh   # 수동 재기동 (cursor+gateway만)

launchctl print "gui/$(id -u)/net.askwho.sw-factory.cursor" | head
tail -f .tools/local-logs/cursor.launchd.err.log
tail -f .tools/local-logs/gateway.launchd.err.log
tail -f .tools/local-logs/git-head-watch.launchd.out.log
tail -f .tools/local-logs/daily-restart.launchd.out.log
```

### 새벽 재기동

| 항목 | 값 |
|------|-----|
| 시각 | `SWF_DAILY_RESTART_HOUR` / `SWF_DAILY_RESTART_MINUTE` (기본 `4` / `0`, **로컬 타임존**) |
| 동작 | `restart-launchagents.sh` — sticky 비움 → cursor → gateway kickstart |
| 비동작 | 이미 ack된 outbox 재배달 없음 · 쿠키 갱신 없음 |

시각 바꾸려면:

```bash
SWF_DAILY_RESTART_HOUR=3 SWF_DAILY_RESTART_MINUTE=30 ./scripts/macos/install-launchagents.sh
```

### HEAD 폴링 (pull → 재기동)

| 항목 | 값 |
|------|-----|
| 주기 | `SWF_GIT_HEAD_POLL_SEC` (기본 `60`, install 시 plist에 기록) |
| 상태 파일 | `.tools/git-head.watch` |
| 동작 | HEAD 변경 감지 → `restart-launchagents.sh` |
| 비동작 | `git fetch`만 (HEAD 불변) · 자동 pull 없음 |

폴링 주기 바꾸려면:

```bash
SWF_GIT_HEAD_POLL_SEC=30 ./scripts/macos/install-launchagents.sh
```

### 코드 변경 후 갱신

tsx가 소스에서 바로 뜨므로 **재기동만** 하면 새 코드가 로드된다. plist 재설치는 보통 불필요.

- **git pull / checkout** → HEAD 폴러가 최대 주기 안에 자동 재기동
- **수동**: `./scripts/macos/restart-launchagents.sh`
- `package.json` 변경 시 pull 후 `npm install`은 사람/별도 훅 책임 (폴러는 프로세스만 재기동)

`run-*.sh` / install / watch 스크립트 / plist를 고쳤을 때만 `./scripts/macos/install-launchagents.sh`를 다시 실행한다.

쿠키 갱신 후 gateway만 재시작:

```bash
# deploy/local/.env 의 GATEWAY_SESSION_COOKIE 수정 후
launchctl kickstart -k "gui/$(id -u)/net.askwho.sw-factory.gateway"
```

## 레이아웃

| 파일 | 역할 |
|------|------|
| `run-cursor.sh` / `run-gateway.sh` | `.env` 로드 후 `tsx` 실행 |
| `watch-git-head.sh` | HEAD 폴링 → restart |
| `daily-restart.sh` | 캘린더 틱 → restart |
| `install-launchagents.sh` | plist 생성·bootstrap (cursor/gateway/git-head-watch/daily-restart) |
| `restart-launchagents.sh` | sticky 비움 + kickstart -k (cursor→gateway; watcher/daily 제외) |
| `uninstall-launchagents.sh` | bootout + plist 삭제 |

Labels: `net.askwho.sw-factory.cursor` · `.gateway` · `.git-head-watch` · `.daily-restart`.

## 한계

- 프로세스 재기동만 보장 — SDK `spawn /bin/zsh` 등 **크래시 원인**은 그대로면 15초 간격으로 재시도한다.
- 로그인 GUI 세션 (`gui/$UID`) — 로그아웃 시 중지. Mac이 잠자기면 캘린더 틱이 밀리거나 건너뛸 수 있다.
- `GATEWAY_SESSION_COOKIE` 만료는 launchd가 모름 — `obtain-cookie.sh` 후 kickstart.
- HEAD 변경·새벽 재기동 시 **진행 중 SDK 세션이 끊긴다**.
- dirty working tree만 바뀌고 HEAD가 같으면 재기동하지 않는다 (의도).
- 재기동·세션 drop은 **이후** prompt/rebind만 고친다 — 이미 ack된 실패 이벤트는 수동 prompt가 필요.
