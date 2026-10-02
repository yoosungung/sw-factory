# macOS LaunchAgents (KeepAlive)

Native cursor + gateway를 **로그인 세션 LaunchAgent**로 등록한다. 프로세스 크래시 시 launchd가 재기동한다 (`KeepAlive`, `ThrottleInterval=15`).

세 번째 agent `git-head-watch`가 **`git rev-parse HEAD`를 폴링**하고, pull/checkout 등으로 HEAD가 바뀌면 cursor+gateway를 재기동한다 (자동 `git pull`은 하지 않음).

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

`run-*.sh` / `launch-env.sh` / install / watch 스크립트 / plist를 고쳤을 때: 진입 스크립트만 바뀌면 `./scripts/macos/restart-launchagents.sh`로 재기동한다. plist 키·경로를 바꿨을 때만 `./scripts/macos/install-launchagents.sh`를 다시 실행한다.

쿠키 갱신 후 gateway만 재시작:

```bash
# deploy/local/.env 의 GATEWAY_SESSION_COOKIE 수정 후
launchctl kickstart -k "gui/$(id -u)/net.askwho.sw-factory.gateway"
```

## 레이아웃

| 파일 | 역할 |
|------|------|
| `launch-env.sh` | `~/.zshrc` export 반영 후 `.env` 로드, `SWF_LAUNCHD_PATH`를 PATH 앞에 붙임 |
| `import-zshrc-env.sh` / `dump-env.pl` | `zsh -lic` 환경 덤프 (실패·타임아웃은 무시) |
| `run-cursor.sh` / `run-gateway.sh` | `launch-env` 후 `tsx` 실행 |
| `watch-git-head.sh` | HEAD 폴링 → restart |
| `install-launchagents.sh` | plist 생성·bootstrap (cursor/gateway/git-head-watch) |
| `restart-launchagents.sh` | kickstart -k (cursor→gateway; watcher 제외) |
| `uninstall-launchagents.sh` | bootout + plist 삭제 |

Labels: `net.askwho.sw-factory.cursor` · `.gateway` · `.git-head-watch`.

## zshrc

진입 스크립트가 `zsh -lic`로 로그인·인터랙티브 시작 파일(`~/.zprofile`, `~/.zshrc`)을 실행하고, **export된 변수만** 프로세스 환경으로 가져온다. `PATH`, `ANDROID_HOME` 같은 CLI 툴체인 값이 여기 해당한다. alias·함수는 넘어오지 않는다.

같은 키가 `deploy/local/.env`에 있으면 `.env`가 이긴다. 가져온 뒤 `SWF_LAUNCHD_PATH`(설치 때 잡은 Node·Homebrew)를 PATH 앞에 붙인다.

`SWF_IMPORT_ZSHRC=0`이면 건너뛴다. `zsh -lic`가 실패하거나 `SWF_ZSHRC_IMPORT_TIMEOUT`(기본 20초)을 넘기면 경고만 남기고 기존 PATH로 기동한다. `~/.zshrc`가 tty가 아니면 바로 return 하면 변수는 비어 있다.

## 한계

- 프로세스 재기동만 보장 — SDK `spawn /bin/zsh` 등 **크래시 원인**은 그대로면 15초 간격으로 재시도한다.
- 로그인 GUI 세션 (`gui/$UID`) — 로그아웃 시 중지.
- `GATEWAY_SESSION_COOKIE` 만료는 launchd가 모름 — `obtain-cookie.sh` 후 kickstart.
- HEAD 변경 시 **진행 중 SDK 세션이 끊긴다**.
- dirty working tree만 바뀌고 HEAD가 같으면 재기동하지 않는다 (의도).
