# Tenant CD adapter (copy into product repos)

This is **not** product business code. Copy into each tenant repository that the factory should deploy.

## Wire-up

1. Copy [`workflow-dispatch/deploy.yml`](workflow-dispatch/deploy.yml) to the tenant repo as `.github/workflows/deploy.yml` (or rename and set `agents[].tenant_cd.workflow`).
2. Fill in the TODO steps (build/push/apply) for that product — keep `workflow_dispatch` inputs `image_tag` and `environment`.
3. In the factory `deploy/k8s/agents.yaml`, add a `repos[]` entry with `tenant_cd` and set the product agent's `primary_repo` (see `agents.yaml.sample` asky / `landing-web`):
   - `workflow`, `ref`, `inputs`, `image_input`
   - `verify.namespace` / `deployment` / `smoke.url` matching the live Service
4. Run `./deploy/k8s/scripts/render-agents.sh` so ta gets `.cursor/tenant-cd-registry.json`.
5. After pm merges a PR: ta **Deploying Test** → `@qa` `@aa` → (pass) **Deploying Prod** → pm Done when feature evidence (test+qa+aa+prod) is complete.

## Evidence fields (Done gate)

See [ARCHITECTURE.md](../../ARCHITECTURE.md) §2.8 — feature Done needs `pr_url`/`merge_sha`, `test_*`, `qa:` pass, `aa:` pass, `prod_*`.

## Local factory checks (no cluster)

```bash
.venv/bin/python -m pytest deploy/k8s/scripts/test_tenant_cd.py -q
```
