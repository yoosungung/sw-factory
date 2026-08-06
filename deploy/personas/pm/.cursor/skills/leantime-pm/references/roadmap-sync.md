# ROADMAP sync (single current milestone)

Use when schedule `pm-roadmap-sync` runs, or Eric asks to sync a repo ROADMAP into Leantime.

Registry: `~/.cursor/roadmap-registry.json` (seeded for pm only). Empty/`repos: []` → no-op with a short final reply.

## Per-repo steps

1. **Read registry entry:** `repo_id`, `git_repo_url`, `path` (default `ROADMAP.md`), `project_id`, `leantime_client_id`.
2. **Clone (ephemeral):**
   ```bash
   ROOT="/tmp/roadmap-sync-${repo_id}"
   URL="$git_repo_url"
   TOKEN="${GH_TOKEN_OVERRIDE:-$GH_TOKEN}"
   if [ -n "$TOKEN" ]; then
     URL=$(printf '%s' "$URL" | sed "s#https://#https://x-access-token:${TOKEN}@#")
   fi
   rm -rf "$ROOT"
   git clone --depth=1 "$URL" "$ROOT"
   ```
   Missing file at `$ROOT/$path` → skip repo with reason (do not invent items).
3. **Parse** markdown:
   - Sections: `##` headings (ignore `#` title / `###`+).
   - Items: `- [ ]` unchecked, `- [x]` / `- [X]` checked (case-insensitive).
4. **Current milestone only:** walk sections top→bottom; first section with ≥1 `- [ ]` = **current**. Do **not** create milestones or tickets for later sections in this run.
5. **Pass gate (document is source of truth):** if every checklist item in a section is checked, that section is passed — the next incomplete section becomes current on a later run. Do not force Leantime ticket Done from this sync; if tickets lag the doc, note once in the session reply (no spam comments).
6. **Milestone upsert:** `list_milestones(project_id)`. Match by headline (section title trimmed). Missing → `create_milestone(headline, project_id, user_id=<pm>)`. Keep `milestoneid`.
7. **Tickets (current section only):**
   - `list_tickets(project_id)`.
   - For each unchecked item, stable slug from headline text (lowercase, non-alnum→`-`, max ~60).
   - Marker: `<!-- roadmap:{repo_id}:{slug} -->`.
   - Skip if any ticket description/comment already contains that marker, or an open ticket headline equals the item text.
   - Else `create_ticket`:
     - `headline` = item text
     - `project_id` from registry
     - `user_id` = pm
     - `status` = New
     - `milestoneid` = current milestone id
     - `description` includes the marker + intake sections (Goal / Non-goals / Acceptance criteria / Risks / Required test·deploy evidence / Architecture notes) filled from the item and section context; leave open questions explicit rather than inventing product scope
     - Leave assignee empty or pm — do not invent developer assignee
8. **Never** enqueue the next milestone while current still has unchecked `- [ ]`.

## Session reply

List per repo: current section title, milestones created/reused, tickets created/skipped, and “blocked on current” if later sections were ignored.
