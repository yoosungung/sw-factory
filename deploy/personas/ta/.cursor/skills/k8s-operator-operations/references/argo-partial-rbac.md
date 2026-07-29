# Argo / BFF closeout with partial RBAC

When Argo workflow mutation is denied, do not stop at `kubectl auth can-i create workflows... = no`.

1. Check exact verbs: `get/list/create/delete/patch workflows.argoproj.io -n <namespace>`.
2. If get/list allowed: inspect phase, node states, args, pods, logs. Nodes are a map — load JSON; do not `range .status.nodes[*]`.
3. If still `Running` and user requested no side effects: local monitoring note only; no PM closeout comments until terminal.
4. If terminal and pods missing: check Argo `podGC`. Use retained workflow status, events, workflow-controller logs; label original pod logs unavailable.
5. If BFF/admin API exists: prefer it for supported ops; verify OpenAPI before claiming parameters like `force_agent`.
6. BFF `409 already active` → monitor or cleanup with delete/patch authority; do not duplicate submit.
7. Distinguish partial success vs blockers in the report.
8. Do not mark deployment/smoke complete until workflow is terminal and app-level smoke evidence is recorded.
