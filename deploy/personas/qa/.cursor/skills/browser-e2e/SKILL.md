---
name: browser-e2e
description: >-
  Playwright E2E(`npm run test:e2e`)를 실행하고 증거를 티켓에 남긴다.
---

# Browser E2E

1. repo root에서 `npm run test:e2e` (필요 시 `npm run test:e2e:install`)
2. 결과를 Active `add_comment`에 `qa: pass|fail` + 요약
3. 실패 시 재현 스텝·로그를 남기고 담당 `@mention`
