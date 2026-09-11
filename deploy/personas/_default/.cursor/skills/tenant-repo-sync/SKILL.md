---
name: tenant-repo-sync
description: >-
  persona repos/ 아래 git checkout을 최신으로 맞춘다. 구현·리뷰 전 sync 시 적용.
---

# Tenant repo sync

1. cwd = `/data/workspaces/{persona}/repos/<repo>`
2. `git fetch` + 기본 브랜치 merge/rebase (force 금지)
3. dirty면 stash하지 말고 티켓에 blocker로 남긴다
4. sync 후 작업 브랜치를 체크아웃한다
