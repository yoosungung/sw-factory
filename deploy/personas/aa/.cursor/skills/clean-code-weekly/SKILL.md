---
name: clean-code-weekly
description: >-
  Weekly clean-code: tenant mechanical command plus Clean Code heuristic review.
  File New tickets on the client project for High/Med findings (NF, not a prod gate).
version: 1.1.0
author: aa persona
license: MIT
---

# Clean code weekly (NF)

**Skills (how):** this skill + `references/`. **Criteria (what/where):** tenant `.factory/quality.yaml` `clean_code:`.

Do not confuse with ticket **`security-review`** (prod gate). Do not set feature ticket Done from this run.

## Procedure

### 1. Discover

For each factory `clients[]` entry with product repo(s):

1. Open that repo workspace `.factory/quality.yaml`.
2. If no `clean_code:` block → skip that client with an explicit reason.
3. Read: `command`, optional `focus_paths`, `exclude_paths`, `max_findings` (default **5**).
4. Resolve Leantime `project_id` for that `client_id`.

### 2. Mechanical

1. Run tenant `clean_code.command` in the product workspace (respect focus/exclude if the command supports them; otherwise note scope in the report).
2. Non-zero exit → treat as finding(s); summarize failures (do not paste only raw lint dumps as the ticket body).
3. Stay within the schedule timebox; if the command hangs, kill, record blocker, continue to heuristic review if possible.

### 3. Heuristic review (core)

Follow [`references/review-procedure.md`](references/review-procedure.md) and [`references/heuristics.md`](references/heuristics.md).

1. Sample hotspots inside `focus_paths` (minus `exclude_paths`): recent changes → large/opaque modules → prod code without tests → I/O·RPC·DB boundaries.
2. Apply heuristics only with **impact** (readability, change cost, defect risk). See anti-dogma in heuristics.
3. Classify severity per [`references/severity.md`](references/severity.md).
4. Cap High/Med findings at `max_findings` (default 5) per client per run. Low → schedule summary only.

Each finding must include: `smell_id`, path:line, short snippet, impact, Boy Scout next patch (no large rewrite), heuristic id(s).

### 4. File tickets

1. Dedup: if an open ticket already covers the same path/smell, add a comment instead of a new ticket (`review-procedure.md`).
2. For each new High/Med finding: `create_ticket` on the client's `project_id`, status **New**, body from [`references/ticket-template.md`](references/ticket-template.md).
3. Assign a client developer when known; otherwise mention `@pm` for routing (or `@eric` only for human-only policy). Never claim `aa: security pass|fail` from this skill.
4. End-of-run report: per client — command result or skip reason; heuristic summary; ticket ids or `no High/Med`.

## Ownership reminder

| | Owner | Location |
|--|--------|----------|
| How to review | AA (factory) | this skill + references |
| What to run / scope | Tenant repo | `.factory/quality.yaml` `clean_code:` |
