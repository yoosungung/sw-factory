# Evidence comment templates (M11)

## After test deploy (Deploying Test)

```text
tenant_cd test evidence
client_id: <leantime_client_id>
repo_id: <repos[].id>
pr_url: <https://github.com/.../pull/N>
merge_sha: <sha>
test_workflow_run_url: <https://github.com/.../actions/runs/...>
test_workflow_conclusion: success
test_rollout: <namespace>/<deployment> OK
test_smoke: HTTP <status> <url>
next: @qa @aa — run E2E + security; then TA prod
```

## After prod deploy (Deploying Prod)

```text
tenant_cd prod evidence
client_id: <leantime_client_id>
repo_id: <repos[].id>
prod_workflow_run_url: <https://github.com/.../actions/runs/...>
prod_workflow_conclusion: success
prod_rollout: <namespace>/<deployment> OK
prod_smoke: HTTP <status> <url>
```

PM (pm) Done requires **all** of: `pr_url`, `merge_sha`, test_*, `qa:` pass, `aa:` pass, prod_* (`feature_evidence.py` / ARCHITECTURE §2.8).

On failure, post partial fields + `blocker:` and `@eric` when human-only.
