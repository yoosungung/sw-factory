---
name: topic-radar
description: >-
  Tenant marketing.yaml sites×keywords로 공개 웹을 검색해 티켓 후보를 만들고
  comment-draft로 넘긴다. 외부 게시·스크래퍼·로그인 금지.
---

# Topic radar (MM)

**Skills (how):** `tenant-repo-sync` + this skill + `references/` + `comment-draft`.  
**Criteria (what/where):** tenant `$path/.factory/marketing.yaml` (스키마: `references/marketing.yaml.example`).

## Procedure

### 0. Sync

Follow **`tenant-repo-sync`** for registry / Active product repos. Later steps use that ephemeral `$path`.

### 1. Discover config

For each synced client product repo:

1. Open `$path/.factory/marketing.yaml`.
2. Missing or empty → **skip** that client with an explicit reason (no inventing sites/keywords).
3. Read: `sites`, `keywords`, `max_age_days` (optional; **default 30** if missing), and pass-through fields for draft (`tone`, `product_mention`, `must_avoid`).
4. Site tips only: `references/sites-guide.md` (P0/P1/P2 추천 — **정본 아님**; yaml이 우선).

### 2. Public web search

1. For each `sites` × `keywords` pair, run a **public** web search (no login, no LinkedIn scrape, no HTML scrapers).
2. Prefer titles/snippets/URLs from search results. Cap volume to stay inside schedule budget.
3. Apply freshness: prefer engine date filters (`after:` / past month / equivalent) when available; keep only results whose publish/update date is within `max_age_days` of today (UTC).
4. Skip paywalled / auth-only surfaces. Skip results with **no usable date** (do not guess).

### 3. Candidate table + dedupe

1. Build a short markdown table: site | keyword | title | url | date | why-relevant.
2. Drop rows older than `max_age_days` (or undated).
3. Dedupe key: `<!-- mm-radar:{site}|{normalized-url-or-title} -->`.
4. If an open ticket description/comment already contains that marker → skip (comment on existing if useful).
5. Else create/update a factory ticket candidate (client project when known) with the marker in the body and the table.

### 4. Hand off to draft

For each new/updated candidate worth a reply sketch, run **`comment-draft`** (yaml tone/product_mention/must_avoid). Do **not** post externally.

## Do not

- Hardcode sites/keywords in this skill
- Auto-comment / auto-post on external sites
- Login scrape or browser automation against social networks
