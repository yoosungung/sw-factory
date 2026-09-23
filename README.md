# sw-factory on Cloudflare Workers

프로젝트·태스크·칸반·코멘트·첨부 등 PM 흐름을 Cloudflare Workers에서 구현한 프로젝트다.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — 계약·스키마·API
- [ROADMAP.md](ROADMAP.md) — 마일스톤
- [AGENTS.md](AGENTS.md) — 에이전트/기여자 워크플로
- [deploy/SETUP.md](deploy/SETUP.md) — Workers 배포·시크릿
- [deploy/docker/](deploy/docker/) — agent 이미지
- [scripts/](scripts/) — **native** 로컬 스택 (`local:run` / `local:stop`, Docker 아님)
- [deploy/local/](deploy/local/) — agent 로컬 Docker 실행
- [deploy/k8s/](deploy/k8s/) — agent Kubernetes (`NS=sw-factory`)
- [backend/DESIGN.md](backend/DESIGN.md) · [frontend/DESIGN.md](frontend/DESIGN.md) · [frontend/ia/](frontend/ia/) — 컴포넌트 설계·IA
- [agent/gateway/](agent/gateway/) · [agent/cursor/](agent/cursor/) — 코딩 agent(배달 / runtime) 설계

## Quickstart

Node.js 22+ 필요. `npm`이 없으면:

```bash
# 이미 ~/.local/bin 이 PATH에 있다면 (이 Mac에 Node 22 설치됨)
hash -r && node -v && npm -v
```

앱만:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

앱 + agent (native, Docker 없음) — 기본 **원격** factory. [scripts/README.md](scripts/README.md):

```bash
cd deploy/local && cp ../env.example .env   # FACTORY_BASE_URL=https://factory.askwho.net
./obtain-cookie.sh                          # GATEWAY_SESSION_COOKIE
npm run local:run:remote-ticket             # agent만 · 원격 티켓 (Vite/migrate 없음)
npm run local:stop
# 또는: npm run local:run (.env가 localhost면 Vite+migrate)
```

로컬 factory: `.env`에 `FACTORY_BASE_URL=http://localhost:5173` 후 `local:run` (Vite+migrate 포함).

- 앱: http://localhost:5173
- API health: `GET /api/health`
- 로컬 admin: `admin@localhost` / `adminadmin` (`.dev.vars`의 `ADMIN_EMAIL`/`ADMIN_PASSWORD`). Space 생성은 이 계정만.

디버그 (VS Code / Cursor): Run and Debug → **Debug All** — Vite + Worker + Chrome + agent:cursor/gateway를 한 번에 기동. gateway 세션은 로컬 유저(`debug-gateway@local`)로 자동 로그인한다. 설정: [`.vscode/launch.json`](.vscode/launch.json).

테스트:

```bash
npm test                 # API (Vitest)
npx playwright install chromium   # E2E 최초 1회
npm run test:e2e         # SPA E2E (Playwright Chromium)
```

컴포넌트별 명령은 [backend/DESIGN.md](backend/DESIGN.md), [frontend/DESIGN.md](frontend/DESIGN.md), [e2e/DESIGN.md](e2e/DESIGN.md)를 본다.
