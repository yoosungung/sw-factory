# sw-factory on Cloudflare Workers

프로젝트·태스크·칸반·코멘트·첨부 등 PM 흐름을 Cloudflare Workers에서 구현한 프로젝트다.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — 계약·스키마·API
- [ROADMAP.md](ROADMAP.md) — 마일스톤
- [AGENTS.md](AGENTS.md) — 에이전트/기여자 워크플로
- [deploy/SETUP.md](deploy/SETUP.md) — 배포·시크릿
- [backend/DESIGN.md](backend/DESIGN.md) · [frontend/DESIGN.md](frontend/DESIGN.md) · [frontend/ia/](frontend/ia/) — 컴포넌트 설계·IA

## Quickstart

Node.js 22+ 필요. `npm`이 없으면:

```bash
# 이미 ~/.local/bin 이 PATH에 있다면 (이 Mac에 Node 22 설치됨)
hash -r && node -v && npm -v
```

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

- 앱: http://localhost:5173
- API health: `GET /api/health`

테스트:

```bash
npm test                 # API (Vitest)
npx playwright install chromium   # E2E 최초 1회
npm run test:e2e         # SPA E2E (Playwright Chromium)
```

컴포넌트별 명령은 [backend/DESIGN.md](backend/DESIGN.md), [frontend/DESIGN.md](frontend/DESIGN.md), [e2e/DESIGN.md](e2e/DESIGN.md)를 본다.
