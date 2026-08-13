# Review procedure (sampling · timebox · dedup)

## Scope

1. Stay inside tenant `focus_paths` when set; always honor `exclude_paths` (`vendor/`, `generated/`, lockfiles, vendored assets).
2. Prefer product source over generated/build output.
3. Mechanical `command` failures and heuristic findings are merged; do not double-count the same line as two tickets unless smells differ.

## Hotspot order

1. **Recent window (weekly cadence):** files touched in the last **7 days** (`git log --since=7.days` / merged PR churn) inside focus paths — covers changes since the prior `aa-clean-weekly`. If a prior run’s sync sha is known and older than 7d, extend lookback to that sha so nothing between weekly fires is skipped; if younger than 7d, still use the full 7d floor.
2. Large or frequently edited modules that read opaque.
3. Production modules with weak or missing tests.
4. Boundaries: HTTP clients, DB access, queue/filesystem adapters.

Skip pure config, snapshots, and license headers unless they hide real logic. The 7d window only ranks sampling priority — still may sample (2)–(4) outside it within the timebox.

## Timebox

- Per client: finish Discover + Mechanical first; leave most wall time for heuristic sampling.
- If time runs out: ship High findings first, note “partial review” in the schedule report, do not invent Low tickets to fill `max_findings`.

## Caps

- `max_findings` (default 5) = max **new** High/Med tickets per client per run.
- Extra issues → bullet list in the run summary (not tickets).

## Dedup

Before `create_ticket`:

1. `list_tickets` on the client `project_id` (open statuses only).
2. If an open ticket already names the same primary path + similar smell → `add_comment` with fresh evidence; do not open a duplicate.
3. If a prior ticket is Done but the smell returned → new ticket with link to the old id.

## Output order

1. Run mechanical command; capture exit + short summary.
2. Sample and score findings (severity.md).
3. File ≤ `max_findings` High/Med tickets (ticket-template.md).
4. One schedule/report comment or session summary: skips, command, ticket ids / `no High/Med`.
