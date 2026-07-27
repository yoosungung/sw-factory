# path-graph GraphRAG runtime closeout pattern

Use this when a Leantime path-graph ticket has code/PR/bundle work completed but still needs GraphRAG rerun and smoke evidence.

## Durable workflow

1. Re-read the active Leantime ticket and comments before acting; path/candy/Eric may have added newer evidence or reassigned ownership.
2. Separate three states in the PM comment:
   - code/PR/CI/bundle registration complete,
   - runtime workflow currently Running/Succeeded/Failed,
   - missing smoke/evidence or RBAC/API blocker.
3. Prefer the agents-runtime BFF/admin path for GraphRAG closeout when direct Argo RBAC is restricted:
   - verify authenticated admin session with `/api/me`,
   - list runs with `/api/pipeline/runs?project_id=...`,
   - run project reconcile via `POST /api/pipeline/projects/{project_id}/reconcile`,
   - submit GraphRAG via `POST /api/pipeline/projects/{project_id}/graphrag` when no active run blocks it.
4. If BFF returns `409 GraphRAG workflow already active for batch ...`, do not open a duplicate rerun or mark Done. Inspect the active workflow/pod/logs and record that terminal evidence is pending.
5. Check OpenAPI/request schema before claiming a parameter is supported. In the observed agents-runtime BFF, `GraphragSubmitRequest` accepted only `batch_id`; `force_agent` was not exposed through BFF even though the Argo WorkflowTemplate has a `force_agent` parameter.
6. If direct Kubernetes RBAC lacks `create/delete/patch workflows.argoproj.io` **and** BFF/admin session is also unavailable, do not leave developer-owned `Blocked` loops — hand off to Eric (`Waiting for Approval`, assignee Eric, concrete grant/session ask). Read-only `get/list workflows`, pod logs, and BFF reconcile may still be enough for partial closeout when those paths work.
7. Leave the Leantime ticket In Progress (active rerun) or Waiting for Approval (human-only) until workflow terminal status plus smoke evidence is present. Do not close from code/CI/bundle evidence alone.

## Evidence to record

- PR URL, merge commit, CI result.
- Bundle version/id/checksum and runtime pool, e.g. `graph-extractor@...`.
- Reconcile report id and counts.
- Workflow name, UID, pod name, phase, relevant parameters (`FORCE_AGENT` if applicable), and log summary.
- BFF responses (`200 reconcile`, `202 submit`, `409 active run`) or Kubernetes RBAC `can-i` results.
- Final smoke result after Succeeded, or failure/error if Failed.
