# Org-wiki layout

Tenant org-wiki repo root (`ORG_WIKI_URL`, e.g. `yoosungung/wiki`). Quartz may publish `wiki/` only; **do not** publish `inbox/` or `raw/`.

```
INDEX.md                 # catalog — km only
wiki/                    # how-to · body (canonical) — km writes; all agents read
inbox/{agent}/           # contributions (raw material) — each sessions bot
raw/                     # optional human/raw material — not Quartz-published
```

Legacy roots `playbooks/`, `glossary/`, `research/`, `routing/` are **not** used; put that content under `wiki/` (any subfolders inside `wiki/` are fine).

## INDEX.md

One bullet per page: link into `wiki/…`, one-line summary, optional `updated`. Km updates on every promote/ingest.

## Frontmatter (canonical pages under `wiki/`)

```yaml
---
id: wiki-foo
status: canonical   # or draft
owner: km
updated: YYYY-MM-DD
review_after: YYYY-MM-DD
sources:
  - inbox/asky/2026-07-28-foo.md
  - ticket:123
---
```

Pages are atomic: one topic, one conclusion. Link L0 docs; do not copy contract text.

## Inbox lifecycle

1. Non-km: write only `inbox/{AGENT_NAME}/YYYY-MM-DD-slug.md` and push main.
2. Km promote: synthesize into `wiki/…`, update `INDEX.md`, then **`git rm` the inbox file** (no `_archived/` keep).
