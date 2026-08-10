# ROADMAP sync (single current milestone + pass-gate)

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
   - Everyday sync sections: `##` headings (ignore `#` title).
   - Checklist items: `- [ ]` unchecked, `- [x]` / `- [X]` checked (case-insensitive).
   - `###` headings are **not** everyday sync targets; use only after pass-gate approval (next milestone).
4. **Current milestone only:** walk `##` sections top→bottom; first section with ≥1 `- [ ]` = **current**. Do **not** create milestones or tickets for later `##` sections in this run.
5. **If current exists** → jump to **Milestone upsert** + **Tickets** below. Skip pass-gate.
6. **If no incomplete `##` section** → **Pass gate** (do not silent no-op):
   - `passed` = last `##` section whose checklist is all `[x]` (if none, skip repo: “no passed section”).
   - `next` = first `###` milestone heading that appears after `passed` in document order (trim title). If missing → session reply “no next ###”; do not invent scope.
   - Marker: `<!-- roadmap:{repo_id}:pass-gate:{passed-slug} -->` (`passed-slug` = stable slug of passed title).
   - Find existing ticket with that marker (`list_tickets` + description/comments). Missing → `create_ticket`:
     - `headline` = `ROADMAP pass gate — {passed} → {next}`
     - `project_id`, `user_id` = pm, `status` / assignee per **Delegate** below
     - `description` = marker + Goal (confirm `{passed}` done; approve opening `{next}`) + Non-goals + AC (`<!-- roadmap-pass:approved -->` from assignee) + evidence notes from ticket history / tenant_cd if any
   - Existing open gate → update assignee/status only if wrong; one `@mention` handoff if stale (no spam).
   - **Approved only when** a comment from the **delegated assignee** contains `<!-- roadmap-pass:approved -->`.
   - Not approved → session reply `pass-gate → @{who}`; **do not** create next milestone tickets.
   - Approved → **Next enqueue** (this run only), then stop everyday rules for this repo.
7. **Never** enqueue the next milestone while current still has unchecked `- [ ]`.

### Delegate (pm picks exactly one)

Resolve mention/`assignedTo` ids from `bridge.json` / `agents.yaml` — **never hardcode names or numeric ids** (including not assuming the admin human is named `eric`).

| Signal | Delegate |
|--------|----------|
| `tenant_cd` and test/prod evidence missing | `ta` |
| E2E / scenario / acceptance not confirmed | `qa` |
| Security review not confirmed | `aa` |
| Next-milestone scope / product / pass judgment | **human** (resolve below) |
| Multiple signals | Single most-blocking lane; if product/scope ambiguous → human |

**Human resolve:**

1. **Client human:** among `agents[]` with `type: human` whose `primary_repo` (or repo membership) belongs to this registry entry’s `leantime_client_id` / client `repo_ids` → that agent’s `leantime_user_id`.
2. **Else admin human:** factory `agents[]` with `type: human` in the admin/factory owner slot (identity by `type: human` + admin/factory primary — **not** by display name).
3. Human delegate → status `Waiting for Approval` (2), assignee = that human id, HTML `@mention` with same id.
4. Staff (`ta`/`qa`/`aa`) → status `In Progress` (4), assignee = staff id, HTML `@mention`.

### Next enqueue (only after pass-gate approved)

1. `list_milestones(project_id)`; match `next` headline; missing → `create_milestone(headline=next, project_id, user_id=pm)`.
2. Parent ticket (one per next milestone):
   - Marker: `<!-- roadmap:{repo_id}:milestone:{next-slug} -->`
   - Skip if marker already present.
   - Else `create_ticket`: headline = `next` title; `status` = New; `milestoneid` = that milestone; description = marker + intake sections filled **only** from the `###` section bullets / success criteria (do not invent product scope).
3. Do **not** rewrite the tenant ROADMAP in this sync. Later everyday sync again uses the first incomplete `##` only.

### Milestone upsert + Tickets (when current `##` has `- [ ]`)

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
8. Do not force Leantime ticket Done from checklist alone; if tickets lag the doc, note once in the session reply (no spam comments).

## Session reply

Per repo: `current` title **or** `pass-gate → @{who}` **or** `approved → created next`; milestones created/reused; tickets created/skipped; “blocked on current” if later `##` sections were ignored.
