# Leantime PM — ticket / MCP operating details

Load when creating/updating tickets, managing assignees/status, evidence, or workflow closeout.
Mentions/HTML basics: follow `leantime-collab` (do not reinvent mention format here).


Leantime is the PM system of record. Use Leantime MCP tools for all PM state changes and communication.

### Communication

- Developer coordination happens through Leantime ticket comments.
- Do not rely on chat-only instructions for project state; important decisions must be reflected in Leantime.
- When asking developers for design review, implementation updates, PR links, test output, or deployment evidence, add a ticket comment.
- When answering developer questions, answer in the same ticket comment thread where possible.
- If Eric decision is needed, mention Eric with the Leantime HTML mention format and clearly state the decision needed.
- Use Leantime/Tiptap-style HTML for comment formatting. Comments are rendered as HTML in Leantime, so prefer `<p>...</p>`, `<br>`, `<ul><li>...</li></ul>`, `<b>...</b>`, and plain `<a href="...">...</a>` links where helpful. Do not rely on Markdown or raw newline rendering. The Leantime mention anchor is also HTML and should be embedded directly when notification is required.

### Leantime Mention Format

Plain text mentions such as `@eric` or `@path` are not sufficient for Leantime notifications. Leantime's mention parser scans comment/project/ticket HTML for an `<a>` tag with `data-tagged-user-id`.

Use this format in MCP-created comments/descriptions when a real notification is intended:

```html
<a class="tiptap-mention" data-tagged-user-id="USER_ID">@firstname</a>
```

Resolve every mention id from `bridge.json` / `MEMORY.md` by agent **name**. Never paste numeric ids from old docs or schedules.

Rules:

1. Do not invent mention handles. Resolve the user id/name from `bridge.json`, Leantime (`get_user`), or project ownership before commenting.
2. Use the HTML anchor mention when the comment is meant to notify a person.
3. Plain `@name` may be used only as prose when notification is not required.
4. If the intended user cannot be resolved, assign the ticket to the known owner or ask Eric rather than writing a fake mention.
5. Keep the rest of the comment as simple Leantime/Tiptap HTML. Wrap paragraphs in `<p>`, use `<br>` for line breaks inside a paragraph, and use `<ul><li>...</li></ul>` for lists. Do not rely on raw newlines or Markdown bullets. Example shape (fill `USER_ID` from `bridge.json`):
   ```html
   <p><a class="tiptap-mention" data-tagged-user-id="USER_ID">@pm</a> 다음 진행 지시입니다.</p>
   <p><b>범위</b></p>
   <ul>
     <li>항목 1</li>
     <li>항목 2</li>
   </ul>
   ```

### Ticket State Management

Dual-loop board (configure on each client Leantime project; ids from `settings.status_board`):

- `New`: intake
- `In Progress`: developer local implementation
- `Review`: PM PR review/merge
- `Deploying Test`: TA test env CD
- `QA`: QA E2E ∥ AA security
- `Deploying Prod`: TA production CD
- `Done`: only when feature evidence complete — `pr_url`, `merge_sha`, `test_*`, `qa:` pass, `aa:` pass, `prod_*` (ARCHITECTURE §2.8). Merge alone is never Done for CD tickets.
- `Blocked` / `Waiting for Approval`: same escalation rules as before (`Blocked` for ticket/external deps with FS marker when applicable; Approval for human-only)

Rules:

1. Update status when work meaningfully changes stage.
2. Do not leave tickets stale after assigning, commenting, reviewing, or receiving blockers.
3. If a developer asks a blocking question, move ticket to `Blocked` or `Waiting for Approval` depending on who must act.
4. If PM requests developer action, keep/mark `In Progress`.
5. If Eric confirmation **or human-only unblock** is required, mark `Waiting for Approval`, assignee Eric, and `@eric` with a concrete ask — do not leave assignee on a developer who already proved they lack the required privilege (RBAC, admin/BFF session, secrets, cluster policy).
6. Never ping-pong `Blocked` + developer assignee when the developer's latest evidence is "cannot proceed without human privilege"; convert to Eric handoff immediately so developer timebox (which skips Blocked/Approval) does not create silent drift. Misroute sweep still reviews Approval for agent-actionable asks.
7. **Flow stall (ARCHITECTURE §2.6 #15 closed-loop):** `pm-checkpoint` watches `Review` / `Deploying Test` / `QA` / `Deploying Prod`. **Silence clock reset** = assignee real progress / `nf-progress:` / completion·blocker only — **not** PM/TA ladder `@mention`s or status-board/seal. PM does not execute TA/QA/AA work and does not kubectl.
   - **≥2h** silence → one re-`@mention` to the **current assignee** (health-check only). Record `hc_at` / `ladder_rung=hc` on the status board.
   - **≥1h** after HC, still no assignee evidence:
     - If assignee is **ta**: **skip** ARC (no self-check) → **dead-by-timeout**.
     - Else: one `@ta` **`assignee-runtime-check`** (Pod/runner logs only). Record `arc_comment_id` / `ladder_rung=arc`. **Do not re-nudge ARC** on the same cycle (30m suppress is not a license to loop).
   - **TA Outcome SLA:** Outcome with `Verdict: alive|dead` within **1h** of ARC → (3). No Outcome ≥**1h** → PM **dead-by-timeout** (no kubectl).
   - After verdict/timeout: **alive** → re-mention original assignee resume; **dead** / dead-by-timeout → restart/`Blocked`/new session (skip dup restart if recent `session.recover` — R1–R5). If assignee=ta or no restart executor → go straight to terminal.
   - **Cycle cap = 1:** after one HC→(ARC|timeout)→resume/restart with still no assignee evidence → **terminal**.
   - **Terminal:** `Waiting for Approval` + admin human (`type: human` from bridge.json — never hardcode ids) `@mention` + concrete ask. Keep under #14 misroute when ask is admin-only.
   - Soft `budget.timeout_ms` expiry is not recovery. Ladder complements R1–R5; does not replace it.
8. **Checkpoint status board (upsert):** Marker `<!-- pm-checkpoint-status -->` (first line of HTML body). Per ticket: find comment with marker (prefer pm) → `edit_comment`; else create once. Use for no-op / within-SLA / skipped summaries **and** `ladder_rung` / `ladder_cycle` / `arc_comment_id` / `hc_at`. **No** `@mention` HTML in the board. Actionable handoffs (`@qa`/`@ta`/admin, misroute, terminal) always use **new** `add_comment`. Ban new comments titled `PM verify`, `Outcome record only`, or “prior run had no Leantime write” remediation spam — use `edit_comment` on the status board instead.
9. **Dep hygiene:** If newest human comments ask to set predecessors / blocked-by / “선행” and description lacks `<!-- blocked-by:... -->`, call `set_blocked_by` in the **same run**, re-read `get_ticket`, then outcome. Do not ACK-only.
- After merge on tenant_cd: status `Deploying Test`, assign/mention **ta** with `merge_sha`. After test evidence: ensure `@qa` `@aa`. After qa+aa pass: ensure ta `Deploying Prod`. Do not `Done` until feature evidence is complete.
- In active watcher/agent environments, re-read the active ticket comments immediately before git-ship or review handoff, and again after opening a PR. If another agent already opened or merged the same scope, do not keep a duplicate PR alive just to satisfy a handoff shape; close the duplicate with a GitHub comment, add a Leantime correction/outcome on the active ticket, and base status on the canonical merged/open PR.

### Human-only privilege handoff

Hand off to Eric (not developer/`pm` Blocked loops) when the next step needs authority agents lack: denied API/RBAC verbs, missing secrets or admin session, policy/platform changes, or live apply outside the agent write scope. Prefer evidence (`can-i`, 401/403, missing secret) over role nicknames.

Handoff comment must include: concrete grant/session/apply needed, already-complete code/PR/bundle evidence, and the post-unblock verification step.

### Human misroute correction

PM checkpoint / queue hygiene (ARCHITECTURE §2.6 #14): fix tickets wrongly parked on a human when a factory agent owns the next step.

**Candidates (per run):**
- Status `Waiting for Approval`, or
- Newest actionable comment `@eric` / assignee Eric (HTML mention id from `bridge.json` eric `leantime_user_id`), even if status is not Approval yet.

**Classify the newest concrete ask (not the ticket title alone):**

| Next step | Action |
|-----------|--------|
| PR review / merge / Review handoff | Bounce → `Review`, assignee **pm**, `@pm` |
| Browser E2E / quality gate | Bounce → `QA`, `@qa` (and `@aa` if security gate due) |
| Tenant CD test/prod deploy | Bounce → `Deploying Test` or `Deploying Prod`, `@ta` |
| Wiki / knowledge promote | Bounce → owning status, `@km` |
| Local implementation still open | Bounce → `In Progress`, developer assignee + mention |
| Secrets, RBAC/policy elevation, product/scope/cost judgment, GH_TOKEN/push needing human | **Keep** Approval + Eric |
| Stall terminal (cycle exhausted / TA SLA miss / IP 3× empty / Review PM silence) | **Keep** Approval + admin |
| Ambiguous / cannot tell | **Keep** Approval (fail-closed toward human) |

**Bounce shape:**
1. `update_ticket`: correct status + assignee for who executes next.
2. One short correction comment: why bounced, previous mistaken human ask, next owner `@mention` (HTML `data-tagged-user-id`).
3. Do not ask Eric to re-approve the bounce.
4. Cap ≤5 misroute corrections per checkpoint run; prefer newest/stale Approval first.
5. If another PM correction was posted on the same ticket within 30 minutes, skip duplicate.

### Reactivated or Reused Tickets

A ticket previously marked `Done` can be explicitly reactivated by a newer comment requesting review or action on a new PR. The newest actionable comment and live GitHub state override stale closeout comments and older ticket status.

1. Re-read the ticket and comments; identify the newest explicit request and its referenced PR.
2. Inspect that live PR rather than assuming the earlier merged PR remains the subject.
3. If an open review PR conflicts with `main` and pm Pod (`GH_TOKEN`) has push permission, merge `origin/main` into the PR branch and resolve only the direct conflicts. Preserve valid content from both sides and apply documented repository retention policies rather than blindly keeping either side.
4. Push the conflict-resolution commit, re-check mergeability, rerun focused/full tests, then approve and merge only when checks are clear or absent by repository design.
5. After merge, re-read the PR state and open-PR list, set the reactivated ticket to `Done` only when the new request is fully complete, and add an active-ticket outcome comment with the PR URL, merge commit, test evidence, and policy-sensitive resolution.

### Assignee Management

- Every Leantime PM ticket and subtask must have an explicit assignee.
- Assign each ticket/subtask to the correct developer or responsible project owner at creation time.
- Parent tickets should also be assigned: use the responsible project owner or PM operator; do not leave parent tickets unassigned.
- **Unassigned triage mention:** When CursorBridge posts `@pm` with marker `cursorbridge-unassigned-triage` on a newly created ticket, set assignee + appropriate status immediately, `@mention` the owner, and leave a short outcome comment.
- Implementation subtasks must have concrete developer assignees before work starts.
- If an assignee is wrong or unavailable, reassign and leave a comment explaining the change.
- Avoid unassigned tickets entirely unless the next step is explicitly triage-only; if so, document that in the ticket and assign it as soon as the owner is known.
- When creating subtasks, include owner, scope, expected PR/output, and acceptance criteria.
- After creating or updating tickets, re-read them and verify `assignedTo`/`userId` reflects the intended owner.

### Parent / Subtask vs FS blocked-by

| Relation | SoR | MCP |
|----------|-----|-----|
| Parent → child (hierarchy) | `dependingTicketId` / `get_all_subtasks` | `update_ticket(..., dependingTicketId=parent)` or create subtask |
| Ticket A blocked until B Done (FS) | description `<!-- blocked-by:B[,...] -->` + usually `Blocked` | **`set_blocked_by(ticket_id, project_id, blocker_ids, status?)`** |

- Never set `dependingTicketId` to mean blocked-by (pollutes parent Done gate).
- Wire procedure: `set_blocked_by` → `get_ticket` confirms marker → outcome comment. Clear with `blocker_ids=[]` then bounce lane when predecessors are Done.
- Soft HTML comments like `<!-- blocked-by:562,563 -->` in prose without MCP upsert are **not** registered until `set_blocked_by` runs.

### Parent / Subtask Hygiene

- Use one parent ticket for the feature/initiative.
- Use subtasks for independently reviewable work.
- Keep subtasks linked to the parent; avoid duplicate orphan tickets.
- If accidental duplicate tickets are created, archive them with a clear duplicate note.
- Parent ticket should summarize the overall goal, scope, design links, rollout plan, and current PM status.
- Subtasks should be small enough for one PR or one focused deliverable.
- Final parent closeout: `get_all_subtasks(parent)` must show every child `Done/Archived` before parent `Done`. Any open subtask blocks parent Done (no Leantime cascade).

#### Canonical ticket mapping guard

Before sending a developer instruction, reviewing a PR, or closing/advancing work:

1. Re-read the parent ticket with `get_ticket(parent_id)`.
2. Re-read canonical subtasks with `get_all_subtasks(parent_id)`.
3. Re-read comments on both the parent and candidate subtask.
4. Treat Leantime parent linkage (`dependingTicketId == parent_id` / visible under `get_all_subtasks`) as canonical, not a bare ticket number mentioned in a PR title/body/comment.
5. If a PR references a ticket number that is not a visible child of the parent, classify it as a possible duplicate/orphan. Do not route follow-up through it until you reconcile it against the parent/subtask list.
6. If the canonical subtask is ambiguous, add a parent-ticket comment naming the chosen canonical ticket and archive duplicates with comments pointing to it.

### Evidence Requirements in Leantime

Before closing or approving, record evidence in Leantime comments:

- PR URL or commit reference
- Test command/output summary
- CI status if available
- Deployment target and image/tag/SHA if deployed
- Smoke test result
- Known limitations/follow-up tickets

All evidence should be recorded in Leantime comments, not only in chat.

#### Single-ticket terminal workflow watchers

When a scheduled/user-directed follow-up is scoped to exactly one Leantime ticket and one Kubernetes/Argo workflow:

1. Keep all Leantime writes scoped to that exact ticket id; do not comment on parent/neighbor tickets or update status unless explicitly authorized and evidence supports it.
2. Check the workflow first. If it is still `Running`, add no Leantime comment and return only the requested local monitoring note.
3. If the workflow is terminal (`Succeeded`, `Failed`, or `Error`), then read `get_ticket(ticket_id)` and `get_comments(module="ticket", module_id=ticket_id)` before any write.
4. Suppress duplicates: if the newest comments already record the final outcome for the exact workflow name, do not add another closeout comment.
5. If adding a final comment, add exactly one concise, well-formed HTML comment with workflow name, namespace if relevant, phase, log/event-tail summary, whether the known prior error recurred, and any evidence limitations (for example Argo PodGC deleted the pod logs).
6. Do not mark `Done` merely because the workflow is terminal. Only close when it `Succeeded` and the ticket comments already contain the required PR/test/deploy/smoke closeout evidence.

## MCP Formatting Rules (PM reminder)

Use conservative Leantime/Tiptap-compatible HTML for MCP-created ticket comments/descriptions:

- Leantime stores comment text and renders it as HTML (`{!! $row['text'] !!}` in the comments template), so HTML formatting is expected.
- Use `<p>...</p>` for paragraphs.
- Use `<br>` only for intentional line breaks inside a paragraph.
- Use `<ul><li>...</li></ul>` or `<ol><li>...</li></ol>` for lists instead of Markdown bullets.
- Use `<b>...</b>` or `<strong>...</strong>` for short labels.
- Use plain HTML links (`<a href="https://...">https://...</a>`) when a clickable link matters; a raw URL is acceptable if formatting is not important.
- Do not assume Markdown will render correctly; avoid Markdown tables, fenced code blocks, or `- ` bullets as the primary formatting.
- The Leantime mention anchor (`<a class="tiptap-mention" data-tagged-user-id="...">@name</a>`) should be embedded directly when notification is required.
- Keep HTML simple and well-formed. Avoid scripts, styles, iframes, images, or complex nested layout.
- After adding an important comment, re-read comments and verify it was stored and readable. If `add_comment` returns `false`, retry with `module="ticket"` and simpler well-formed HTML.
- In watcher/automation contexts, expect concurrent handlers to add comments, merge PRs, or update status within seconds. After any GitHub merge/review or Leantime mutation, re-read the exact active ticket and its newest comments before deciding final status. If a newer comment records stricter remaining evidence than your earlier assessment (for example Docker/image smoke still missing), align status with the newest verified state rather than closing from stale context.
