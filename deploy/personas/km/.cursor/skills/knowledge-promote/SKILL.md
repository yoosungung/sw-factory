---
name: knowledge-promote
description: >-
  org-wiki inbox 기여와 @finder brief를 canonical 페이지·INDEX로 합성한다.
  inbox drain, promote, INDEX 갱신, wiki librarian 작업 시 적용한다.
---

# Knowledge promote (finder)

계약: `ARCHITECTURE` §2.9. 레이아웃: `_default` `org-knowledge/references/wiki-layout.md`(동일 규칙).

## Workspace

- Primary가 org-wiki면 `WIKI_ROOT=/workspace/repo`.
- 아니면 `ORG_WIKI_URL`로 clone (`org-knowledge`와 동일).

## 입력

1. `inbox/*/*.md` where `status: inbox` (not under `_archived/`)
2. Active ticket `@finder` brief (사실·출처·긴급도)

## 절차

1. `git pull --ff-only origin main`
2. inbox 항목별로 출처 확인(티켓·L0 링크·URL). L0 계약 본문 복제 금지.
3. 중복·모순 병합 → atomic canonical 페이지 (`playbooks/`|`glossary/`|`research/`|`routing/`)
4. frontmatter: `id`, `status: canonical`, `owner: finder`, `updated`, `review_after`, `sources`
5. `INDEX.md` 갱신
6. 원본을 `inbox/_archived/{agent}/…`로 `git mv`
7. main 직커밋·푸시 — **PR·git-ship·feature branch·force 금지**
8. Active 티켓(있으면) `add_comment`: 최종 경로·요약. 스케줄만이면 Done/New 티켓 규칙(`finder-wiki`)

## 금지

- 제품 코드 구현, 타 repo push
- 시크릿·PAT를 wiki에 기록
- seewin 정치 위키와 병합
