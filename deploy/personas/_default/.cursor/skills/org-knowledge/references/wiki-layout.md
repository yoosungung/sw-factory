# Org-wiki layout

Teant org-wiki repo root (not seewin political wiki).

```
INDEX.md                 # catalog — finder only
inbox/{agent}/           # contributions — each sessions bot
inbox/_archived/         # after promote — finder only
playbooks/               # how-to — finder canonical
glossary/                # terms — finder canonical
research/                # synthesized research — finder canonical
routing/                 # who/where to ask — finder canonical
```

## INDEX.md

One bullet per page: link, one-line summary, optional `updated`. Finder updates on every promote/ingest.

## Frontmatter (canonical pages)

```yaml
---
id: playbooks-foo
status: canonical   # or draft
owner: finder
updated: YYYY-MM-DD
review_after: YYYY-MM-DD
sources:
  - inbox/asky/2026-07-28-foo.md
  - ticket:123
---
```

Pages are atomic: one topic, one conclusion. Link L0 docs; do not copy contract text.
