# Evidence comment template

Candy Done gate (tenant_cd tickets) requires **all** of the following on the Active ticket comments.

```text
tenant_cd evidence
pr_url: <https://github.com/.../pull/N>
merge_sha: <40-char or short sha>
workflow_run_url: <https://github.com/.../actions/runs/...>
workflow_conclusion: success
rollout: <namespace>/<deployment> OK
smoke: HTTP <status> <url>
agent: <product agent name, e.g. asky>
```

On failure, still post what you have and name the missing/failed field:

```text
tenant_cd evidence
pr_url: ...
merge_sha: ...
workflow_run_url: ...
workflow_conclusion: failure
rollout: <namespace>/<deployment> FAIL — <one-line reason>
smoke: skipped or HTTP <status> <url>
blocker: <next action; @eric if human-only>
```

Do not set ticket status to Done from infra; candy closes after verifying these fields.
