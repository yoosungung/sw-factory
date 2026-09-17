# Factory PM — ticket / MCP operating details

Load when creating/updating tickets, managing assignees/status, evidence, or workflow closeout.
Mentions: Markdown `@Name` matching project member `users.name` (see ARCHITECTURE Comment @mention). Body format is Markdown(GFM).

Factory tickets are the PM system of record. Use factory-mcp for all PM state changes and communication.

### Communication

- Developer coordination happens through ticket comments.
- When asking developers for design review, implementation updates, PR links, test output, or deployment evidence **they must do now**, add a ticket comment with `@Name`.
- **Wait = silence:** CI pending, PR OPEN/unstable, merge deferred, or standby → no agent `@mention`. Record on the checkpoint status board (`class=ci-wait` / `review-ci-wait`, no mention) or stay silent. Mentions resume only when the next owner has an actionable step.
- If admin/human decision is needed, `@mention` that human (`type: human` in `agents.yaml`) with a concrete ask.
- Do not use HTML Tiptap mention anchors.

### Ticket State Management

Dual-loop board uses project status **keys**:

- `backlog`: intake
- `in_progress`: developer local implementation
- `review`: PM Intent Pass (`intent:`) + PR merge
- `deploying_test`: TA test env CD
- `qa`: QA E2E ∥ AA security
- `deploying_prod`: TA production CD
- `done`: only when feature evidence complete — `pr_url`, `merge_sha`, `test_*`, `qa:` pass, `aa:` pass, `prod_*`. Merge alone is never Done for CD tickets (skill gate, not backend-enforced).
- `blocked` / `waiting_for_approval`: Blocked for ticket/external deps with FS marker; Approval for human-only

Rules:

1. Update status when work meaningfully changes stage.
2. Do not leave tickets stale after assigning, commenting, reviewing, or receiving blockers.
3. If a developer asks a blocking question, move ticket to `blocked` or `waiting_for_approval` depending on who must act.
4. If PM requests developer action, keep/mark `in_progress`.
5. If human-only unblock is required, mark `waiting_for_approval`, assignee admin human, and `@Name` with a concrete ask.
6. Never ping-pong `blocked` + developer assignee when the latest evidence is "cannot proceed without human privilege".
7. **Flow stall:** `pm-checkpoint` watches `review` / `deploying_test` / `qa` / `deploying_prod`. **Silence clock reset** = assignee real progress / `nf-progress:` / completion·blocker only — **not** ladder `@mention`s or status-board/seal. PM does not execute TA/QA/AA work and does not kubectl.
   - **≥2h** silence → one re-`@mention` to the **current assignee** (health-check only). Record `hc_at` / `ladder_rung=hc` on the status board.
   - **≥1h** after HC, still no assignee evidence:
     - If assignee is **ta**: **skip** ARC → **dead-by-timeout**.
     - Else: one `@ta` **`assignee-runtime-check`** (Pod/runner logs only). Record `arc_comment_id` / `ladder_rung=arc`.
   - **TA Outcome SLA:** Outcome with `Verdict: alive|dead` within **1h** of ARC. No Outcome ≥**1h** → PM **dead-by-timeout**.
   - After verdict/timeout: **alive** → re-mention original assignee; **dead** → restart/`blocked`. **Cycle cap = 1** then terminal.
   - **Terminal:** `waiting_for_approval` + admin human `@mention` + concrete ask.
   - **Mention/comment storm:** lookback last **2h** or newest **30** comments. Mutual agent `@mention` ≥**8** or outcome-seal ≥**12** → immediate terminal Approval+admin. No further agent `@mention`.
8. **Checkpoint status board (upsert):** Marker `<!-- pm-checkpoint-status -->` on the first line. Find comment with marker (prefer pm) → `edit_comment`; else `add_comment` once. No `@mention` in the board. Actionable handoffs always use **new** `add_comment`. Review with checks pending: `class=ci-wait`; do not `@mention` IC “for after CI”.
9. **Dep hygiene:** If newest human comments ask to set predecessors / blocked-by / “선행” and description lacks `<!-- blocked-by:... -->`, call `set_blocked_by` in the **same run**, re-read `get_ticket`, then outcome.
- After merge on tenant_cd: status `deploying_test`, assign/mention **ta** with `merge_sha`. After test evidence: `@qa` `@aa`. After qa+aa pass: ta `deploying_prod`. Do not `done` until feature evidence is complete.
- Re-read comments before git-ship or review handoff. If another agent already opened or merged the same scope, close the duplicate PR and base status on the canonical PR.

### Human-only privilege handoff

Hand off to admin human (not developer/`pm` Blocked loops) when the next step needs authority agents lack: denied API/RBAC, missing secrets, policy changes, or irreversible apply. Handoff comment must include: concrete grant needed, already-complete evidence, and post-unblock verification.

### Human misroute correction

Fix tickets wrongly parked on a human when a factory agent owns the next step.

**Candidates:** status `waiting_for_approval`, or newest actionable `@admin` / human assignee.

| Next step | Action |
|-----------|--------|
| PR review / merge / Review handoff | Bounce → `review`, assignee **pm**, `@pm` |
| Browser E2E / quality gate | Bounce → `qa`, `@qa` (and `@aa` if security due) |
| Tenant CD test/prod deploy | Bounce → `deploying_test` or `deploying_prod`, `@ta` |
| Wiki / knowledge promote | Bounce → owning status, `@km` |
| Local implementation still open | Bounce → `in_progress`, developer assignee + mention |
| Secrets, RBAC, product/scope/cost, human token | **Keep** Approval + admin |
| Stall terminal | **Keep** Approval + admin |
| Ambiguous | **Keep** Approval |

**Bounce shape:** `update_ticket` correct status + assignee; one short correction comment with Markdown `@Name`; cap ≤5 per checkpoint run.

### Reactivated tickets

Newest actionable comment and live GitHub state override stale closeout. Re-read ticket+PR; merge `origin/main` into the PR if needed; `done` only when the new request is complete.

### Assignee Management

- Every ticket must have an explicit assignee (unassigned → pm triage).
- Kickoff: `list_project_members(project_id)`. `in_progress` 구현 → `lane=developer`. `deploying_*` → `lane=ta`; `qa` → `qa`; security → `aa`; wiki → `km`. Missing lane → `waiting_for_approval` + admin, ask People to set lane. `role` is access, not assignment.

### Parent / Subtask vs FS blocked-by

| Relation | SoR | MCP |
|----------|-----|-----|
| Parent → child (hierarchy) | `milestone_id` on child | `update_ticket(..., milestone_id=parent)` ; list with `list_tickets(query.milestone_id)` |
| Ticket A blocked until B Done (FS) | description `<!-- blocked-by:B[,...] -->` + usually `blocked` | **`set_blocked_by(ticket_id, blocker_ids, status?)`** |

- Never set `milestone_id` to mean blocked-by.
- Wire: `set_blocked_by` → `get_ticket` confirms marker → outcome. Clear with `blocker_ids=[]`.
- Parent closeout: `list_tickets?milestone_id=parent` every child `done` before parent `done`.

### Evidence

Record in ticket comments (not chat only): PR URL, test summary, CI, deploy SHA, smoke, follow-ups. Markers `test:` / `qa:` / `aa:` / `prod:`.

Do not mark `done` merely because a workflow is terminal.

### MCP formatting

Markdown(GFM). `@Name` for wake. After important writes, re-read the Active ticket.
