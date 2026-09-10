# Deploy Setup

## Prerequisites

- Cloudflare account + Workers Paid (R2/D1 사용 시 플랜 확인)
- `wrangler` 로그인: `npx wrangler login`

## One-time

```bash
npx wrangler d1 create sw-factory
# wrangler.jsonc 의 database_id 를 출력된 id 로 교체

npx wrangler r2 bucket create sw-factory-files
npx wrangler secret put SESSION_SECRET
npx wrangler d1 migrations apply sw-factory --remote
```

## Deploy

```bash
npm run deploy
# = vite build + wrangler deploy -c dist/sw_factory_workers/wrangler.json
```

## Local

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```
