---
name: knowledge-promote
description: >-
  org-wiki inbox 기여와 @km brief를 wiki/ canonical·INDEX로 합성한다.
  inbox drain, promote, INDEX 갱신, wiki librarian 작업 시 적용한다.
---

# Knowledge promote (km)

계약: `ARCHITECTURE` §2.9. 레이아웃: `_default` `org-knowledge/references/wiki-layout.md`(동일 규칙).

## Workspace

- Primary가 org-wiki면 `WIKI_ROOT=/workspace/repo`.
- 아니면 `ORG_WIKI_URL`로 clone (`org-knowledge`와 동일).

## 입력

1. `inbox/*/*.md` where `status: inbox`
2. Active ticket `@km` brief (사실·출처·긴급도)

## 절차

1. `git pull --ff-only origin main`
2. inbox 항목별로 출처 확인(티켓·L0 링크·URL). L0 계약 본문 복제 금지.
3. 중복·모순 병합 → atomic canonical 페이지 under **`wiki/`** (하위 폴더 자유)
4. frontmatter: `id`, `status: canonical`, `owner: km`, `updated`, `review_after`, `sources`
5. `INDEX.md` 갱신 (링크는 `wiki/…`)
6. 원본 inbox 파일 **`git rm`** (아카이브 폴더 없음 — 합성 후 삭제)
7. main 직커밋·푸시 — **PR·git-ship·feature branch·force 금지**
8. Active 티켓(있으면) `add_comment`: 최종 `wiki/` 경로·요약. 스케줄만이면 Done/New 티켓 규칙(`km-wiki`)

## 금지

- 제품 코드 구현, 타 repo push
- 시크릿·PAT를 wiki에 기록
- seewin 정치 위키와 병합
- `inbox/_archived/` 유지(사용하지 않음)
