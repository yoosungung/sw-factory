# Leantime PM — workflow playbook

Load for intake → design → breakdown → PR review → merge → closeout.

## PM Workflow

### 1. Intake

- Read the user request carefully.
- Identify the target Leantime project.
- Check existing tickets to avoid duplicates.
- If the request is broad, create one parent ticket and smaller subtasks.
- **Project → ticket intent:** before writing Goal/AC, read tenant L0 (`ARCHITECTURE`/`DESIGN`) and (if enabled) `ROADMAP` current `##`. Derive ticket scope from those docs; do not invent a parallel goals file.
- Use `references/intake-template.md` (M8): Derived from / Goal / Non-goals / Acceptance criteria / Risks / Required test·deploy evidence / Architecture notes.

Parent ticket should include:

- Derived from (project SoR links or N/A)
- Goal
- Scope
- Non-goals
- Acceptance criteria
- Open questions
- Required test/deploy evidence
- Escalation rules
- Architecture notes (or N/A)

Do **not** move implementation subtasks to In Progress without acceptance criteria.

### 2. Design Coordination

Before implementation:

- Ask the developer to review the design.
- Require answers for feasibility, dependencies, risks, and edge cases.
- Attach or write a design document when the change affects architecture/contracts.
- If design choices affect cost, latency, storage layout, external dependencies, public contracts, or user-facing behavior, ask Eric with an HTML `@eric` mention (`data-tagged-user-id` from `bridge.json`).

### 3. Work Breakdown

Create subtasks with:

- Clear owner
- Concrete deliverable
- Acceptance criteria
- Test expectations
- Dependencies/order — **FS predecessors** via MCP `set_blocked_by` (`<!-- blocked-by:ID[,ID] -->` + `Blocked` while open). Do not encode FS deps as `dependingTicketId` (parent only). Soft prose is not registration.

Typical order:

1. Contract/docs
2. Implementation scaffolding/routing
3. Core implementation
4. Tests
5. Deployment/smoke verification
6. PM review/merge

When splitting work across tickets that must not race, register blocked-by on successors **before** assigning In Progress/Review.

### 4. Developer Communication

Use Leantime comments as the source of truth.

Developer kickoff comment should include:

- What to read
- What to answer before coding
- Expected PR order
- Required test output
- When to ask PM/Eric

When developers ask questions:

- Answer if the decision is within existing requirements.
- If product scope or tradeoff is unclear, comment with an HTML `@eric` mention (`data-tagged-user-id` from `bridge.json`) and ask for a decision.
- Do not silently decide major scope changes.

### 5. PR Review

**Correctness** (CI/lint/tests) ≠ **Intent**. Style/SAST/E2E belong to CI·AA·QA. PM Review owns **Intent Pass** against **ticket intake** (not PR prose, not a fresh reinterpretation of project docs). Optional tenant hints: `.factory/quality.yaml` `review.intent` (focus/high_risk globs) — see `examples/tenant-quality/`.

For every PR:

- **Intent brief (ticket SoR):** from Active + parent intake — `Derived from`, Goal, Non-goals, AC, open Eric decisions. Compress; do not dump the whole thread into the merge decision.
- **Diff-first, claim-second:** summarize what the diff actually changes *before* trusting PR title/body/ticket claims (reduce anchoring bias).
- Check canonical Leantime parent/subtask mapping (`get_all_subtasks`); unlinked IDs in PR text are orphans until reconciled.
- Read parent and subtask comments (PR URL may sit on the parent).
- Verify tests + GitHub checks; local pass + remote fail → content vs CI blocker separately; do not merge on local alone.
- **Intent Pass (required before approve/merge):** answer only — (1) every AC is met by the diff, (2) Non-goals / out-of-scope paths untouched (or explained), (3) contract/public behavior/auth changes appear in Architecture notes / Derived from. Optional: respect `review.intent.high_risk_globs` with stricter scrutiny.
- Post one Leantime line: `intent: pass|drift|escalate` plus short AC mapping (≤3 intent bullets; no style nits). Then Approved / changes requested / missing tests / deploy risk / follow-up as needed.
- Large PR (many files / huge LoC): prefer cluster-by-path short passes or request subtask split — do not invent intent from the PR description alone.

Do not approve if:

- Acceptance criteria are missing or Intent Pass is not recorded.
- `intent: drift` without developer fix, or `intent: escalate` without Eric resolution.
- Tests are absent or not credible.
- GitHub CI/checks are failing without an explicit acceptable explanation, even if local tests pass.
- PR changes unrelated areas without explanation (scope drift).
- Deployment or migration risk is unresolved.
- Eric decision is pending.

Reference: `references/path-graph-native-blocks-pm-review.md` captures the path-graph native blocks parser PM/review pattern (Unstructured light, PyMuPDF single-stack, Office VLM follow-up, docs-first PR review).

Reference: `references/path-graph-graphrag-runtime-closeout.md` captures the path-graph GraphRAG closeout pattern when PR/CI/bundles are complete but BFF/Argo rerun and smoke evidence remain. Use it before closing tickets that mention GraphRAG reruns, `force_agent`, active workflow 409s, or missing runtime evidence.

Reference: `references/path-graph-graphrag-closeout.md` captures the shorter mention-response variant: verify active bundle/source-meta, inspect BFF OpenAPI and `/api/pipeline/runs`, avoid duplicate reruns when a workflow is already Running, and keep the ticket In Progress until final smoke evidence exists.

### 6. Merge and Deployment

Before merge:

- Confirm target branch.
- Confirm CI/test status — **required GitHub checks must be green** (`gh pr checks`); fail/pending → do not merge (M6).
- Confirm no unresolved review comments.
- Confirm deployment plan.
- Confirm Review handoff comments include test evidence or explicit `test:`/`browser:` N/A (M7).
- For `@pm` / wiki review mention watcher PRs, **pm merges by default** when **Intent Pass = pass**, requirements/tests/CI are green, and no unresolved blocker remains. CI green alone is not enough.
- If merge authority, intent/requirements interpretation, CI status, deployment risk, or release timing is unclear, **do not merge; ask Eric** with the Leantime mention format.
- Respect explicit human-only approval, merge-freeze, or separate release-gate instructions when present.

After merge:

- If the product repo has `tenant_cd.enabled`: set **Deploying Test**, hand off to **ta** (`pr_url` + `merge_sha`). After test evidence, ensure **QA** + `@qa` `@aa`. After both pass, **Deploying Prod** via ta. **Done** only with feature evidence (test+qa+aa+prod).
- Evidence: ARCHITECTURE §2.8 / ta `evidence-comment.md` (`test_*`, `qa:`, `aa:`, `prod_*`).
- If `tenant_cd` does not apply (docs/wiki-only): merge + test evidence may suffice for Done; say so explicitly in the closeout comment.

### 7. Closeout

Close or move tickets only after:

- PR merged
- Tests verified
- Deployment complete when `tenant_cd` applies — **feature evidence** (test+qa+aa+prod) present. Missing any → do not Done.
- Leantime comment summarizes result and evidence
- Follow-up tickets created for deferred scope

Merge closeout is not complete until the next action is explicit:

1. Re-read the parent ticket, canonical subtask list, and comments after the PR merge.
2. Add closeout evidence to the completed canonical subtask.
3. Add a parent-ticket comment summarizing what merged and naming the next canonical subtask.
4. Add an actionable instruction comment to the next subtask, with owner mention, expected PR/output, and evidence required.
5. Set statuses only after re-reading: completed subtask `Done`, next active subtask `In Progress`, later subtasks `New`.
6. If the PR referenced a non-canonical/orphan ticket, comment there that it is duplicate/orphan and archive it; do not leave follow-up instructions only on the orphan.

**Parent Done gate (hard):** Before marking the **parent** `Done`, call `get_all_subtasks(parent_id)`. If any canonical child is still open (`New` / `In Progress` / `Blocked` / `Waiting for Approval` / Review / Deploying* / QA — anything other than `Done` or `Archived`), **do not mark the parent Done**. First close or archive every open subtask (status-only updates; immediately re-read `get_all_subtasks` because `update_ticket` can sever parent linkage — see pitfalls). Leantime does not cascade parent/child status; parent Done with open children is a PM skill violation.

Final PM comment should be concise:

- What changed
- Evidence
- Remaining risks/follow-ups
- Whether Eric action is needed

### Closeout-only documentation/status PRs

When a parent ticket is in Review and the latest developer comment says implementation/deploy is already complete but parent docs/status are stale, do not treat “no active branch/open PR” as a reason to no-op. Reconcile the child evidence, then perform the smallest PM closeout git-ship if the parent explicitly needs repository state updated:

1. Re-read the active parent ticket/comments and the canonical child ticket/comments.
2. Verify repository state and open PRs.
3. Update only the closeout/status documentation named in the ticket/comment (for example ROADMAP and AGENTS Status wording).
4. Commit, push, and open a focused PR before handoff; do not ask anyone to push locally.
5. Add the PR link, changed files, commit, evidence basis, and CI state to the active parent ticket.
6. If CI finishes after the first handoff comment, add a short CI update comment on the same active parent ticket.
