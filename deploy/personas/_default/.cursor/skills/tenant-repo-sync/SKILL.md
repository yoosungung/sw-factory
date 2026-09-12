---
name: tenant-repo-sync
description: >-
  persona repos/ 아래 git checkout을 최신으로 맞춘다. 구현·리뷰 전 sync 시 적용.
---

# Tenant repo sync

Checkout은 seed/`ensure-repos-cli`가 만든다. 없으면 임의 URL로 clone하지 말고 재시드한다.
- 로컬: `seed-personas.sh` / `seed-cli`
- k8s: Pod 재시작(entrypoint ensure) 또는 `job-seed-personas.yaml`

1. 대상 목록: `.cursor/clients-repos-registry.json` (또는 Active ticket의 product repo)
2. cwd = `/data/workspaces/{persona}/repos/<repo>` (registry `path`)
3. `git fetch` + 기본 브랜치 merge/rebase (force 금지)
4. dirty면 stash하지 말고 티켓에 blocker로 남긴다
5. sync 후 작업 브랜치를 체크아웃한다
