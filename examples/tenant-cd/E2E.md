# Demo tenant E2E checklist (manual; external repo + cluster)

Factory-side automated chain: `pytest deploy/k8s/scripts/test_tenant_cd.py`.

## Once per demo tenant

1. Copy `workflow-dispatch/deploy.yml` into the tenant repo; implement build/push/apply TODOs.
2. Set `tenant_cd` on the product agent in `deploy/k8s/agents.yaml` (mirror `agents.yaml.sample` asky).
3. `./deploy/k8s/scripts/render-agents.sh && python deploy/k8s/scripts/sync-bridge-json.py`
4. Roll infra persona ConfigMap / restart `cursor-agent-infra` so registry is seeded.

## Ticket loop

1. Dev bot: implement → git-ship → Review.
2. candy: merge when checks green → comment `pr_url` + `merge_sha` → assignee infra + `@mention`.
3. infra: `tenant-cd` skill → dispatch → watch → rollout → smoke → evidence comment.
4. candy: Done only if all four evidence groups present.

## Pass criteria

- Done ticket comments contain `pr_url`, `merge_sha`, `workflow_run_url`, `workflow_conclusion: success`, `rollout: … OK`, `smoke: HTTP …`.
- No product source landed in the framework git repo.
