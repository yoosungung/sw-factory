---
name: comment-draft
description: >-
  marketing.yaml tone/product_mention/must_avoid로 2–5문장 초안만 작성한다.
  외부 게시 금지 — factory 티켓 코멘트에만.
---

# Comment draft (MM)

Used after `topic-radar` (or when Active asks for a reply sketch).  
Schema: `../topic-radar/references/marketing.yaml.example`.

## Procedure

1. Load tenant `$path/.factory/marketing.yaml` (or fields already on the ticket). Missing → stop; do not invent brand rules.
2. Apply:
   - `tone` — voice constraint
   - `product_mention` — soft-mention only (0–1 natural mention; never hard sell)
   - `must_avoid` — forbidden phrases/claims
3. Write **2–5 sentences** of draft reply/comment text only.
4. Leave the draft on the **Active factory ticket** via `add_comment` (or ticket body section). Label clearly as draft.
5. Evidence line: `mm: draft-only — not posted externally`.

## Do not

- Post, comment, or message on LinkedIn / forums / blogs / social
- Open login flows or paste the draft into external UIs
- Expand into a blog post or campaign brief (out of scope)
