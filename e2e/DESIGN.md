# E2E Design

SPA + Worker API를 **Playwright Chromium**(번들/CfT 브라우저)으로 검증한다. 시스템 Chrome/Safari를 쓰지 않는다.

macOS + Chromium 조합에서 Playwright 기본 `fill`/`click`이 hang 되는 경우가 있어, `helpers.ts`는 DOM `input`/`click`/`requestSubmit`으로 조작한다.

## 범위

| 스펙 | 검증 |
| --- | --- |
| `smoke.spec.ts` | health · 로그인 가드 · register/login · 비admin Create space 숨김 |
| `happy-path.spec.ts` | admin Space → Project → Board 이슈 생성 · Issue 패널 · settings |
| `nav.spec.ts` | Top nav 직접 링크 (Spaces · Projects · Your work) · 프로젝트 목록→보드 |
| `fe3-fe5.spec.ts` | Your work · Search · Account · Filters · Dashboards · History |
| `admin.spec.ts` | 시드 admin `/admin` · Space 생성 · 이메일 초대 |

API 단위 테스트는 `npm test`(Vitest). E2E는 브라우저 플로우만.

## 언제 쓰고 언제 돌리나

| 시점 | 할 일 |
| --- | --- |
| **개발 중** (UI·플로우 변경) | 해당 플로우를 `e2e/*.spec.ts`에 **시나리오로 추가·갱신** (helpers 재사용) |
| **마일스톤 종료** (`ROADMAP` → done 직전) | `npm test` + **`npm run test:e2e`** 전체 green 확인 |

워크플로 정본: [AGENTS.md §2](../AGENTS.md) · 게이트: [ROADMAP 진행 규칙](../ROADMAP.md).

## Commands

```bash
# 최초 1회: Chromium(+headless shell) 설치
npm run test:e2e:install
# CDN이 막히면 DESIGN 하단 수동 설치 참고

npm run test:e2e          # headless (Playwright Chromium)
npm run test:e2e:headed   # headed
npm run test:e2e:ui       # Playwright UI
```

`PLAYWRIGHT_BASE_URL`이 있으면 기존 서버를 쓰고, 없으면 `db:migrate:local` + `dev`(5173)를 띄운다.

## 수동 브라우저 설치 (CDN timeout 시)

Playwright revision은 `npx playwright --version` / 에러 메시지 기준(현재 chromium-1243). Chrome for Testing 빌드:

```bash
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
VER=153.0.8010.12   # install 실패 로그의 CfT 버전과 맞출 것
REV=1243
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
curl -L -o /tmp/chrome.zip \
  "https://storage.googleapis.com/chrome-for-testing-public/${VER}/mac-arm64/chrome-mac-arm64.zip"
curl -L -o /tmp/chrome-headless.zip \
  "https://storage.googleapis.com/chrome-for-testing-public/${VER}/mac-arm64/chrome-headless-shell-mac-arm64.zip"
unzip -qo /tmp/chrome.zip -d "$PLAYWRIGHT_BROWSERS_PATH/chromium-${REV}"
unzip -qo /tmp/chrome-headless.zip -d "$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-${REV}"
```

이후 동일 셸에서 `PLAYWRIGHT_BROWSERS_PATH=... npm run test:e2e`.

