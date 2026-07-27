# Leantime PM — workflow playbook

Load for intake → design → breakdown → PR review → merge → closeout.

## PM Workflow

### 1. Intake

- Read the user request carefully.
- Identify the target Leantime project.
- Check existing tickets to avoid duplicates.
- If the request is broad, create one parent ticket and smaller subtasks.
- Use `references/intake-template.md` (M8): Goal / Non-goals / Acceptance criteria / Risks / Required test·deploy evidence / Architecture notes.

Parent ticket should include:

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
- If design choices affect cost, latency, storage layout, external dependencies, public contracts, or user-facing behavior, ask Eric with `<a class="tiptap-mention" data-tagged-user-id="1">@eric</a>`.

### 3. Work Breakdown

Create subtasks with:

- Clear owner
- Concrete deliverable
- Acceptance criteria
- Test expectations
- Dependencies/order

Typical order:

1. Contract/docs
2. Implementation scaffolding/routing
3. Core implementation
4. Tests
5. Deployment/smoke verification
6. PM review/merge

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
- If product scope or tradeoff is unclear, comment with `<a class="tiptap-mention" data-tagged-user-id="1">@eric</a>` and ask for a decision.
- Do not silently decide major scope changes.

### 5. PR Review

For every PR:

- Read the PR/diff.
- Check that it maps to the canonical Leantime parent/subtask, not merely to a number in the PR title or body.
- If the PR title/body references multiple ticket IDs, verify each against `get_all_subtasks(parent)` and choose the visible linked child as canonical. Treat unlinked IDs as duplicates/orphans until reconciled.
- Read the parent ticket comments as well as the subtask comments; developers may post the actionable PR URL on the parent while the review belongs to a child subtask.
- Verify tests were run.
- If needed, run local checks or inspect CI.
- Compare local verification with GitHub checks. If local tests pass but GitHub checks are failing, record the content verdict and the CI blocker separately, keep the ticket In Progress/Waiting for Approval as appropriate, and do not mark Done or merge until the check is rerun or explained.
- Comment with:
  - Approved / changes requested
  - Missing tests
  - Scope drift
  - Deployment risk
  - Required follow-up

Do not approve if:

- Acceptance criteria are missing.
- Tests are absent or not credible.
- GitHub CI/checks are failing without an explicit acceptable explanation, even if local tests pass.
- PR changes unrelated areas without explanation.
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
- For `@candy` / wiki review mention watcher PRs, **candy merges by default** when the PR satisfies requirements, tests/CI pass, and no unresolved blocker remains.
- If merge authority, requirements interpretation, CI status, deployment risk, or release timing is unclear, **do not merge; ask Eric** with the Leantime mention format.
- Respect explicit human-only approval, merge-freeze, or separate release-gate instructions when present.

After merge:

- If the product agent has `tenant_cd.enabled` (framework registry / ticket hints asky|path|… + deploy): **hand off to infra** — assignee infra, `@mention` infra, comment `pr_url` + `merge_sha` + product `agent` name. Do **not** mark Done yet.
- infra runs `tenant-cd` (`workflow_dispatch` → rollout → smoke) and posts the evidence comment.
- Require deploy evidence (all four groups for tenant_cd tickets):
  - `pr_url`, `merge_sha`
  - `workflow_run_url`, `workflow_conclusion=success`
  - `rollout: namespace/deployment OK`
  - `smoke: HTTP <status> <url>`
- If `tenant_cd` does not apply (docs/wiki-only): merge + test evidence may suffice for Done; say so explicitly in the closeout comment.

### 7. Closeout

Close or move tickets only after:

- PR merged
- Tests verified
- Deployment/smoke complete when `tenant_cd` applies — **all four evidence field groups** present (see Merge and Deployment). Missing any field → keep In Progress/Blocked, do not Done.
- Leantime comment summarizes result and evidence
- Follow-up tickets created for deferred scope

Merge closeout is not complete until the next action is explicit:

1. Re-read the parent ticket, canonical subtask list, and comments after the PR merge.
2. Add closeout evidence to the completed canonical subtask.
3. Add a parent-ticket comment summarizing what merged and naming the next canonical subtask.
4. Add an actionable instruction comment to the next subtask, with owner mention, expected PR/output, and evidence required.
5. Set statuses only after re-reading: completed subtask `Done`, next active subtask `In Progress`, later subtasks `New`.
6. If the PR referenced a non-canonical/orphan ticket, comment there that it is duplicate/orphan and archive it; do not leave follow-up instructions only on the orphan.

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
