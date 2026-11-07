# macOS LaunchAgents (KeepAlive)

Native cursor + gateway를 **로그인 세션 LaunchAgent**로 등록한다. 프로세스 크래시 시 launchd가 재기동한다 (`KeepAlive`, `ThrottleInterval=15`).

추가로:

- **`git-head-watch`** — `git rev-parse HEAD` 폴링, pull/checkout 등으로 HEAD가 바뀌면 cursor+gateway 재기동 (자동 `git pull` 없음).
- **`daily-restart`** — 매일 로컬 시각 **04:00**(기본)에 cursor+gateway 위생 재기동. 장수 프로세스·SDK 좀비 세션 누적을 줄인다.

재기동 시 gateway `sticky.json`을 비운다 (in-memory agent_id는 프로세스와 함께 무효). SDK active-run 실패 시 cursor가 세션 맵에서 제거해 다음 dispatch가 404→rebind 한다 ([agent/cursor/DESIGN.md](../../agent/cursor/DESIGN.md)).

Docker/k8s 감독의 대체는 아니다 — 상시 호스트(예: Mac Mini)에서 `local:run` 대신 쓸 때용. **한 번에 한 호스트만** LaunchAgent를 켠다(같은 factory outbox를 두 대가 소비하면 안 됨).

## 전제

- `npm install` 완료
- [`deploy/local/.env`](../../deploy/local/)에 `FACTORY_BASE_URL`, `GATEWAY_SESSION_COOKIE`, (실 SDK면) `CURSOR_API_KEY`
- [`deploy/agents.yaml`](../../deploy/agents.yaml) 존재
- **`npm run local:run`과 동시 사용 금지** (같은 `:8080` / data-dir)
- LaunchAgent는 `gui/$UID` — 콘솔 **GUI 로그인** 유지(자동 로그인 권장). SSH만으로는 세션이 없으면 `bootstrap` 실패.

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

### 코드 변경 후 갱신 (호스트에 git이 있을 때)

tsx가 소스에서 바로 뜨므로 **재기동만** 하면 새 코드가 로드된다. plist 재설치는 보통 불필요.

- **git pull / checkout** → HEAD 폴러가 최대 주기 안에 자동 재기동
- **수동**: `./scripts/macos/restart-launchagents.sh`
- `package.json` 변경 시 pull 후 `npm install`은 사람/별도 훅 책임 (폴러는 프로세스만 재기동)

`run-*.sh` / install / watch 스크립트 / plist를 고쳤을 때만 `./scripts/macos/install-launchagents.sh`를 다시 실행한다.

쿠키 갱신 후 gateway만 재시작:

```bash
# deploy/local/.env 의 GATEWAY_SESSION_COOKIE 수정 후
# (원격: cd deploy/local && ./obtain-cookie.sh)
launchctl kickstart -k "gui/$(id -u)/net.askwho.sw-factory.gateway"
```

## 원격 Mac Mini (rsync · SSH, 미니에서 git clone 없음)

개발 Mac에서 트리를 밀어 넣고, Mini는 LaunchAgent만 돌린다. SSH 호스트 예: `macmini-server` → `~/sw-factory`.

### 최초 설치

1. Mini: Remote Login, 서비스 계정 **GUI 자동 로그인**, Sleep 끔, Node 22+(Homebrew 등 PATH).
2. 개발 Mac에서 코드·시크릿 동기화 후 원격 `npm install` + `install-launchagents.sh` (아래 갱신 명령과 동일, 최초는 install).
3. `.env`의 `DATA_HOST` / `AGENTS_FILE`이 개발 Mac 절대경로면 Mini 경로로 고친다  
   (`/Users/<mini-user>/sw-factory/deploy/local/.local-data`, `.../deploy/agents.yaml`).

### 코드 갱신 (일상)

개발 Mac 저장소 루트에서 (`HOST`/`REMOTE`만 맞춤):

```bash
HOST=macmini-server
REMOTE=/Users/eric/sw-factory   # Mini 쪽 트리

rsync -az --delete \
  --exclude node_modules \
  --exclude .tools \
  --exclude deploy/local/.local-data \
  --exclude .wrangler \
  --exclude '**/dist' \
  --exclude e2e/test-results \
  --exclude e2e/playwright-report \
  ./ "$HOST:$REMOTE/"

# 시크릿이 바뀌었을 때만
rsync -az deploy/local/.env "$HOST:$REMOTE/deploy/local/.env"
rsync -az deploy/agents.yaml "$HOST:$REMOTE/deploy/agents.yaml"
# 필요 시 Mini에서 DATA_HOST/AGENTS_FILE 경로 재확인

ssh "$HOST" bash -s <<EOF
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:\$HOME/.local/bin:\$PATH"
cd $REMOTE
# package.json / lock 변경 시에만:
# npm install
./scripts/macos/restart-launchagents.sh
# plist·run-*.sh·watch 스크립트를 고쳤으면 restart 대신:
# ./scripts/macos/install-launchagents.sh
EOF
```

| 변경 | Mini에서 |
|------|----------|
| `agent/`·TS 소스만 | `restart-launchagents.sh` |
| `package.json` / lock | `npm install` 후 restart |
| `scripts/macos/*` · plist 내용 | `install-launchagents.sh` |
| `.env` 쿠키만 | `obtain-cookie.sh` 후 gateway `kickstart -k` |
| `agents.yaml` | restart (또는 install 불필요, restart면 충분) |

`.git`을 rsync에 포함하면 Mini의 `git-head-watch`가 개발 Mac에서 push된 HEAD 변경을 감지한다(자동 pull 없음 — 갱신은 위 rsync가 담당). `.git`을 빼면 HEAD 폴러는 사실상 no-op.

개발 Mac에서 예전에 LaunchAgent를 썼다면 Mini만 켜기 전에 `./scripts/macos/uninstall-launchagents.sh`로 끈다.

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
- rsync 갱신 시 `--exclude deploy/local/.local-data` — PVC(세션·sticky·workspaces)는 Mini에 남긴다. `--delete`는 원격에만 있고 로컬에 없는 **추적 파일**을 지우므로 exclude 목록을 유지한다.
