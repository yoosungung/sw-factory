# Tenant quality adapter (copy into product repos)

Not product business code. Place at repo root as `.factory/quality.yaml` (and linked scenario/scripts).

See [ARCHITECTURE.md](../../ARCHITECTURE.md) §1.12 · §2.8.

## Example `.factory/quality.yaml`

```yaml
e2e:
  base_url_env: test
  scenarios_path: e2e/scenarios
  # QA browser-e2e follows scenarios_path
bulk_api:
  # optional; weekly qa-bulk-weekly + ticket when configured
  command: "python scripts/bulk_probe.py --env test"
opik:
  # optional; agent apps
  project_name: my-agent-app
  dataset: weekly-regression
  command: "python scripts/opik_eval.py"
security:
  command: "npm run security:check"
  # AA security-review (ticket gate)
clean_code:
  # Criteria (what/where) — this repo. AA skill owns how to review (Clean Code heuristics).
  command: "ruff check . && ruff format --check ."   # stack-specific; e.g. npm run lint && npm test
  focus_paths: ["src/", "app/"]
  exclude_paths: ["vendor/", "generated/"]
  max_findings: 5
  # AA clean-code-weekly: mechanical command + heuristic review → New NF tickets
load:
  command: "k6 run load/smoke.js"
  # TA load-weekly
deploy:
  # pointer only; actual CD is repos[].tenant_cd + examples/tenant-cd
  environments: [test, production]
```

### `clean_code` ownership

| | Who | What |
|--|-----|------|
| **Criteria** | This tenant repo | `command`, paths, `max_findings`, stack tools |
| **Skills** | Factory AA (`clean-code-weekly`) | Heuristic review procedure, ticket schema, severity |

`command` is the mechanical gate (lint/format/tests). AA still performs Clean Code heuristic review on hotspots; findings become `New` tickets on the client project (not a feature Done / security gate).

Factory agents discover this file in the client git workspace after **`tenant-repo-sync`** (ephemeral checkout from `clients-repos-registry.json`); criteria bodies stay in the tenant repo. Do not rely on a stale Pod primary clone alone.

### Long-run NF (`long_run: true`)

Optional boolean on `bulk_api` / `opik` / `load` / `clean_code`. When set (or runtime clearly ≫ factory `budget.timeout_ms`), weekly agents **detach** the command and leave `nf-progress:` heartbeats — they must not foreground-wait in the schedule session (ARCHITECTURE §2.6 #10). Tenant runners should write a progress file and/or comment heartbeats so pm stall treats silence correctly.
