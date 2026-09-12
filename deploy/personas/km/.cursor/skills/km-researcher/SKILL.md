---
name: km-researcher
description: >-
  org-wiki 리서치 ingest와 inbox drain. km-wiki 스케줄,
  wiki 리서치, main 직푸시 시 적용한다.
---

# KM researcher (km schedule)

`km-wiki` 스케줄용. `knowledge-promote` + 웹/소스 ingest.

## 순서

1. `git pull --ff-only origin main` (`WIKI_ROOT` = org-wiki cwd 또는 `ORG_WIKI_URL` clone)
2. **Inbox drain** — `knowledge-promote`로 미처리 `inbox/` 승격
3. **Research ingest** — 주제에 대해 **wiki-first** 후 필요할 때만 웹. 합성은 `wiki/` canonical + `INDEX`
4. main 직커밋·푸시. PR·git-ship·feature branch 금지
5. 성공 → Active/스케줄 티켓에 요약. 실패 → blocker + `@eric` 필요 시

## success 기준 (스케줄)

- default branch에만 push
- `git-ship` / `gh pr create` 미사용
- inbox drain 시도(비어 있으면 no-op로 명시)
