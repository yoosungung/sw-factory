---
name: tenant-cd
description: >-
  Deploy tenant (product) software via GitHub workflow_dispatch, wait for the
  run, verify cluster rollout + in-cluster HTTP smoke, and leave Leantime
  evidence comments. Use when assigned a post-merge deploy ticket or @mentioned
  for tenant_cd / deploy / smoke.
version: 1.0.0
author: infra persona
license: MIT
---

# Tenant CD (M5)

운영 SW CD는 공장(infra)이 수행한다. 제품 소스는 테넌트 repo에만 있다.

일일 `infra-k8s-daily` 스케줄은 **read-only** — 이 스킬은 **티켓/멘션으로 배포가 요청된 때만** 사용한다.

세부:

| 파일 | 언제 |
|------|------|
| `references/dispatch.md` | `gh workflow run` + `gh run watch` |
| `references/verify.md` | `kubectl rollout status` + HTTP smoke |
| `references/evidence-comment.md` | Done 게이트 필수 필드 템플릿 |

## Lookup

1. Read `~/.cursor/tenant-cd-registry.json` (없으면 blocker + `@eric`).
2. Match by ticket hint: product **agent name** (예: asky) or `git_repo_url`.
3. If no match / `enabled` missing → not a CD ticket; do not invent deploy steps.

## Procedure

1. MCP: `get_ticket` + `get_comments` on Active ticket. Require `merge_sha` (and `pr_url` if present).
2. Follow `references/dispatch.md` then `references/verify.md`.
3. `add_comment` with `references/evidence-comment.md` fields (success or failure).
4. On success: leave ticket In Progress (or return to candy) — **candy** marks Done when all four evidence groups exist.
5. On failure: Blocked or In Progress + `@eric` with the failing field; do not claim Done.

## Non-goals

- Do not copy product business code into the framework repo.
- Do not use `kubectl set image` as the primary driver (M5 v1 = `workflow_dispatch` only).
- Do not mutate the cluster on scheduled daily reports.
