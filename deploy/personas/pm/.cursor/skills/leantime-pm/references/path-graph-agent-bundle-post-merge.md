# path-graph agents-runtime bundle post-merge closeout

Use when a path-graph Leantime ticket/PR changes files under `agents/graph-extractor/` or `agents/wiki-synthesizer/`, especially fixes for runtime import errors such as `No module named 'graph_extractor'`.

## Pattern

1. Re-read the active Leantime ticket and comments before doing post-merge work.
2. Verify GitHub PR state and CI:
   - `gh pr view <PR> --json url,state,mergeCommit,statusCheckRollup`
   - Require `state == MERGED` and relevant checks `SUCCESS` before runtime closeout.
3. Fast-forward local main:
   - `git switch main`
   - `git pull --ff-only origin main`
4. Re-run focused tests from `pipeline/`, for example:
   - `uv run --extra dev python -m pytest tests/test_agent_bundles.py tests/test_graph_extractor_output_schema.py`
   - Include any newly relevant tests, e.g. sanitization or batching tests.
5. Register new agent bundles from merged main if the ticket/PR requires runtime availability:
   - Prefer the repo script `scripts/register-agent-bundles.sh all <version>` when `zip`, `jq`, and `agents.k8s-test` DNS are available.
   - If local host DNS for `agents.k8s-test` is missing but Kubernetes access works, resolve the ingress address with `kubectl -n runtime get ingress agents-runtime -o wide` and use `curl --resolve agents.k8s-test:443:<ADDRESS>`.
   - If `zip` is not installed, create the bundle zip with Python `zipfile`; do not persist environment-specific “zip missing” as a blocker if the Python fallback works.
   - If the shell helper is blocked by local tool/DNS shape, use a small Python `requests.Session` fallback: read `runtime/initial-admin-password` via `kubectl`, login to `https://<ingress-address>/api/auth/login` with `Host: agents.k8s-test`, take the `csrf_token` cookie, then `POST /api/source-meta/bundle` with the zip file and compact JSON `meta`. Print only bundle name/version/id/checksum; never print the password.
   - Use the runtime `initial-admin-password` secret only for the registration call; never print the password.
6. Record verifiable evidence on the same active ticket only:
   - merged PR URL and merge commit
   - focused test command/output summary
   - registered bundle names/versions, ids, and checksums
   - runtime pod health if checked
7. Before posting the final closeout comment, re-read the active ticket comments. These tickets are often handled by concurrent candy/watchdog runs; if a newer comment already registered the bundle or recorded a stricter blocker, align with that newest evidence and avoid duplicating or contradicting it.
8. If bundle registration returns `already exists`, do not treat the locally computed checksum alone as canonical. Verify the existing source-meta entry when possible, or phrase the Leantime evidence as “already registered” rather than claiming a new id/checksum. For agents-runtime, a durable verification pattern is:
   - Login with the runtime `initial-admin-password` secret without printing it.
   - Fetch `/api/source-meta` with the session cookie.
   - Filter for `kind=agent`, target `name`, and target `version`, then record the active id/checksum/version from the server response.
9. Verify agent-pool load separately from registration. For graph-extractor fixes, check `deploy/agent-pool-compiled-graph` logs for `resolve?kind=agent&name=graph-extractor`, bundle download/redirect, and the expected checksum; this proves the runtime pool is resolving/loading the registered bundle, but it still is not full end-to-end GraphRAG success.
10. For the GraphRAG rerun/smoke step:
   - Prefer the BFF/API rerun path when available. A proven agents-runtime route is: login to `/api/auth/login`, then `POST /api/pipeline/projects/{project_id}/graphrag` with the original `batch_id` and `force_agent=true`; this submits through the runtime/BFF service account instead of candy directly creating Argo Workflow CRs.
   - If BFF returns `409 GraphRAG workflow already active for batch ...` but the visible Argo workflow for that batch is already terminal Failed, classify this as an active-run reconciliation blocker rather than a code/bundle blocker.
   - If a new or existing Argo workflow is visibly Running, monitor it instead of posting stale “cannot rerun” blockers. Check workflow phase, main-container logs, and agent-pool logs. For import-fix tickets, absence of the original import traceback plus visible `graph-extractor` job polling/LLM calls is useful interim evidence, but do not close Done until the workflow reaches a terminal success/smoke state.
   - If the rerun remains long-running beyond the current turn, add one interim Leantime comment with PR/CI/test/bundle/runtime-load evidence, keep the ticket non-Done, and arrange a bounded follow-up watcher that comments only on terminal Succeeded/Failed. Avoid duplicate interim comments.
   - If direct `kubectl create workflow` is forbidden for the candy service account **and** no privileged UI/BFF/operator path can rerun, do **not** leave the ticket `Blocked` with a developer assignee. Hand off to Eric: `Waiting for Approval`, assignee Eric, `@eric` with the concrete RBAC/session ask (see `SKILL.md` Human-only handoff).
10. If concurrent comments disagree (for example one says Blocked while a newer workflow is Running), re-read the active ticket and use the newest verified external state as source of truth. Add one concise correction/outcome comment and set status to `In Progress` for an active rerun, `Waiting for Approval` (+ Eric) when no agent-owned rerun path remains, or `Done` only after terminal smoke evidence.
11. If the ticket is already Done, do not churn status; add the post-merge evidence comment and leave status unchanged unless a newer verified blocker shows Done was premature.

## Notes

The durable lesson is the closeout sequence and fallback pattern, not the transient setup state (missing `zip`/`jq`/DNS on a host). Capture the successful workaround and verifiable bundle ids/checksums in Leantime. Treat stale active-run reconciliation and missing Argo create RBAC as operational blockers to document, not as reasons to reopen code work.
