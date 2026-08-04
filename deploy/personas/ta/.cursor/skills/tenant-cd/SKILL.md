---
name: tenant-cd
description: >-
  Deploy client (Leantime client_id) product software via workflow_dispatch to
  test then production, hand off to QA/AA, verify rollout + smoke, leave evidence.
  Use when assigned Deploying Test / Deploying Prod or @mentioned for tenant_cd;
  also when publishing the factory cursor-agent-runner image via publish-runner.yml.
version: 2.0.0
author: ta persona (TA)
license: MIT
---

# Tenant CD (M11 — TA)

테넌트 신원 = Leantime **`client_id`**. 직원(TA)은 client에 묶이지 않으나 조회 키는 client_id+repo.

일일 `ta-k8s-daily`는 **read-only**. 이 스킬은 티켓/멘션 배포 요청 시에만.

| 파일 | 언제 |
|------|------|
| `references/dispatch.md` | `gh workflow run` + watch (`test` / `production`) |
| `references/verify.md` | rollout + HTTP smoke |
| `references/evidence-comment.md` | test_* / prod_* 증거 템플릿 |
| `references/publish-runner.md` | factory `cursor-agent-runner` GHCR publish (`publish-runner.yml`) |

## Lookup

1. Read `~/.cursor/tenant-cd-registry.json`.
2. Prefer **`client_id` + `repo_id`** (from ticket project → clients registry). Fallback: `repo_id`, git URL, then legacy agent name.
3. No match → not CD; do not invent deploy.

## Feature loop procedure

### A. Deploying Test

1. MCP: `get_ticket` + `get_comments`. Need `merge_sha` (+ `pr_url`).
2. Dispatch with `environment=test` (override registry default if needed) — `references/dispatch.md`.
3. Verify — `references/verify.md`. Comment **test_*** fields (`references/evidence-comment.md`).
4. Set status **QA** (use `settings.status_board` / client `status_map` — do not hardcode ids).
5. Assignee/`@mention` **qa** and **aa** — ask E2E + security in parallel.
6. Do **not** deploy prod yet.

### B. Deploying Prod (only after qa: pass and aa: pass on comments)

1. Confirm comments include `qa:` … pass and `aa:` … pass.
2. Dispatch `environment=production`, verify, comment **prod_*** fields.
3. Return to pm/PM — pm Done when feature evidence complete (test+qa+aa+prod). Never Done from TA.

### Failure

Blocked or In Progress + developer/`@eric`; do not claim Done.

## Non-goals

- Product source into factory repo.
- Primary driver other than `workflow_dispatch`.
- Weekly load belongs to sibling `load-weekly` skill, not this path.
