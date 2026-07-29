# Org-wiki layout

Teant org-wiki repo root (not seewin political wiki).

```
INDEX.md                 # catalog — km only
inbox/{agent}/           # contributions — each sessions bot
inbox/_archived/         # after promote — km only
playbooks/               # how-to — km canonical
glossary/                # terms — km canonical
research/                # synthesized research — km canonical
routing/                 # who/where to ask — km canonical
```

## INDEX.md

One bullet per page: link, one-line summary, optional `updated`. Km updates on every promote/ingest.

## Frontmatter (canonical pages)

```yaml
---
id: playbooks-foo
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
