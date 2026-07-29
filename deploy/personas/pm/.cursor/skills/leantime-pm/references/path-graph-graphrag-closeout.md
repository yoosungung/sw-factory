# Path-graph GraphRAG closeout / rerun evidence pattern

Use this when a Leantime path-graph ticket has code/PR/bundle work merged but remains open for GraphRAG rerun or smoke evidence.

## Context signals

- Ticket asks for GraphRAG rerun for tenant/project/batch, often after fixing `No module named 'graph_extractor'` or BundleLoader import issues.
- Latest comments may say code/PR/bundle registration is complete, but ticket remains Blocked/In Progress pending workflow/run evidence.
- Typical evidence fields: PR URL/merge commit, active bundle (`graph-extractor@...` id/checksum), workflow/run name, phase, pod health, smoke result.

## Race-safe PM sequence

1. Re-read the active Leantime ticket and comments before touching anything.
2. Verify GitHub PR state only if the latest comments do not already establish merged/CI status or if the status may have changed.
3. Verify runtime/bundle state through agents-runtime source-meta when possible: active `graph-extractor@...` version, id, checksum, status.
4. Check BFF/API state before assuming rerun is blocked:
   - `GET /openapi.json` to confirm request shape.
   - `GET /api/pipeline/runs?project_id=...` (or list runs then filter) to find active/recent runs for the batch.
   - Kubernetes workflow/pod status may provide stronger live evidence when available.
5. If a rerun is already Running, do not submit another duplicate run. Record the workflow name, run id, started_at, phase, pod status, and relevant logs; keep/move the ticket In Progress, not Done.
6. If BFF returns `409 GraphRAG workflow already active`, reconcile/list runs and inspect the named active/failed workflow before escalating.
7. Only mark Done after final workflow success plus required smoke evidence is recorded.

## BFF / API quirks observed

- agents-runtime OpenAPI may define `GraphragSubmitRequest` with only `batch_id`; comments requesting `force_agent=1` may not map to the public BFF request body. If submitted through that route, the workflow can be created with `FORCE_AGENT=0` even though the rerun still exercises the agent path.
- A valid admin/browser session cookie can be enough to query BFF endpoints even when a path service account cannot read admin secrets or create Argo workflows directly.
- Source-meta listing can confirm the active bundle without re-registering: check `name=graph-extractor`, version, id, checksum, `status=active`.

## Leantime comment shape

Use a concise HTML comment on the active ticket with:

- Current workflow/run name and run id.
- Batch id and project id.
- Workflow phase and pod status.
- Active bundle version/id/checksum.
- Whether the original error point appears passed (for example agent-pool shows `graph-extractor` job polling/SGLang calls) vs final smoke still pending.
- Status decision: In Progress while Running; `Waiting for Approval` + Eric assignee when auth/RBAC/API is human-only and no agent-owned path remains; Done only after success/smoke.
