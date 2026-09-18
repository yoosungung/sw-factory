# Deploy Setup

프로덕션 호스트: **`https://factory.askwho.net`**  
Worker 이름: `sw-factory-workers` (루트 `wrangler.jsonc` `name`)

## Prerequisites

- Cloudflare account + Workers Paid (R2/D1 사용 시 플랜 확인)
- **`askwho.net` 존이 같은 Cloudflare 계정에 Active** (네임서버가 Cloudflare를 가리킴)
- `wrangler` 로그인: `npx wrangler login`
- `factory.askwho.net`에 **기존 CNAME/A/AAAA가 있으면 제거** (Custom Domain이 DNS·인증서를 직접 만듦). MX/TXT(메일)는 건드리지 않는다.

## One-time (리소스)

```bash
npx wrangler d1 create sw-factory
# 출력된 database_id 로 wrangler.jsonc 의 database_id 를 교체한 뒤 커밋

npx wrangler r2 bucket create sw-factory-files
npx wrangler secret put SESSION_SECRET   # 강한 랜덤 값
npx wrangler secret put ADMIN_PASSWORD   # 시드 admin 비밀번호 (≥8자)
# ADMIN_EMAIL 은 wrangler secret 또는 vars. 미설정이면 시드하지 않음.
npx wrangler d1 migrations apply sw-factory --remote
```

## Deploy (코드)

### GitHub Actions (권장)

워크플로: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)  
트리거: `main` push · `workflow_dispatch` (`gh workflow run deploy.yml`)

배포 시 **`wrangler d1 migrations apply sw-factory --remote` 후** Worker deploy.
(`wrangler deploy`만으로는 D1 스키마가 따라가지 않음 — `0006_comment_updated_at` 누락 시 comments API 500.)

Repo Secrets (Settings → Secrets and variables → Actions):

| Secret | 용도 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Edit Cloudflare Workers **+ D1 Edit** (또는 동등 스코프) |
| `CLOUDFLARE_ACCOUNT_ID` | 배포 계정 ID |

`deploy.yml`은 Build 다음 **Apply D1 migrations** → **Deploy Worker** 순서다.

Worker secrets(`SESSION_SECRET` 등)는 대시보드/`wrangler secret`에 두고 Actions에 넣지 않는다.

### Local

```bash
npm run deploy
# = vite build + d1 migrations apply --remote + wrangler deploy -c dist/sw_factory_workers/wrangler.json
```

최초 배포 후 `*.workers.dev` URL로도 접근 가능하다. 세션 쿠키는 `Secure`이므로 **HTTPS**에서만 로그인된다.

## Custom Domain: `factory.askwho.net`

아래 중 **하나**만 한다. (둘 다 하면 중복·충돌 가능)

### A. Dashboard (권장 · 1회)

1. [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → `sw-factory-workers`
2. **Settings** → **Domains & Routes** → **Add** → **Custom Domain**
3. `factory.askwho.net` 입력 → **Add Custom Domain**
4. DNS에 레코드가 생기고 TLS가 발급될 때까지 대기 (보통 수분)

### B. Wrangler (재현 가능)

`wrangler.jsonc`에 추가:

```jsonc
"routes": [
  {
    "pattern": "factory.askwho.net",
    "custom_domain": true
  }
]
```

그다음 `npm run deploy`. 이후 배포마다 도메인이 재확인된다.

에러 `Hostname already has externally managed DNS records` → DNS에서 해당 호스트의 CNAME/A/AAAA만 삭제한 뒤 재시도.

## Verify

```bash
curl -sS https://factory.askwho.net/api/health
# 브라우저: https://factory.askwho.net 로그인·세션 유지 확인
```

## Local

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

로컬 admin: `.dev.vars`의 `ADMIN_EMAIL` / `ADMIN_PASSWORD` (예: `admin@localhost` / `adminadmin`). 첫 API 요청 시 시드. Space 생성은 이 계정만.

## Agent (Docker / k8s)

- 이미지: [docker/README.md](docker/README.md)
- 로컬 실행: [local/README.md](local/README.md) — **`user_id` 등록**(`register-agent-users.sh`) · seed · run
- 클러스터 (`NS=sw-factory`): [k8s/README.md](k8s/README.md)
- 프로덕션 Worker URL 기본값: `https://factory.askwho.net`

Agent `user_id` = factory `users.id`. 봇은 `POST /api/auth/register`로 만들고 yaml에 UUID를 넣는다. 상세: [local/README.md](local/README.md#agent-user_id-등록).

## 참고

- Custom Domain 문서: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- 도메인 삭제 시 자동 발급된 Advanced Certificate는 대시보드에서 수동 정리할 수 있다 (기능에는 영향 없음).
