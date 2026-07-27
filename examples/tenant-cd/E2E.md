# Demo tenant E2E checklist (manual; external repo + cluster)

Factory-side automated chain: `pytest deploy/k8s/scripts/test_tenant_cd.py`.

목표 테넌트(예): asky / `askwho.net` (Leantime project id 19). 공장 repo에는 제품 소스를 넣지 않는다.

## Once per demo tenant

1. 테넌트 repo에 [`workflow-dispatch/deploy.yml`](workflow-dispatch/deploy.yml)을 `.github/workflows/deploy.yml`로 복사하고, build/push/apply TODO를 **실제로** 채운다 (`workflow_dispatch` inputs `image_tag`·`environment` 유지).
2. 공장 `deploy/k8s/agents.yaml`의 **`repos[]`**에 제품 repo + `tenant_cd`를 넣고, 제품 agent에 `primary_repo: <id>`를 건다 (`agents.yaml.sample` asky/`landing-web` 참고). `verify.smoke.url`은 클러스터에서 실제로 응답하는 Service URL로 확정.
3. `./deploy/k8s/scripts/render-agents.sh && python deploy/k8s/scripts/sync-bridge-json.py`
4. infra persona ConfigMap 반영 후 `kubectl -n leantime rollout restart statefulset/cursor-agent-infra` — `.cursor/tenant-cd-registry.json`이 Pod에 시드됐는지 확인.

## Ticket loop (1건)

1. Leantime에 askwho(또는 데모 프로젝트) 티켓 생성 → assignee = 제품 봇(asky 등).
2. Dev bot: 구현 → `git-ship`(push+PR) → Review 핸드오프.
3. candy: required checks 초록이면 merge → 코멘트에 `pr_url` + `merge_sha` → assignee=`infra` + `@mention`.
4. infra: `tenant-cd` 스킬 → `workflow_dispatch` → run watch → `kubectl rollout status` → in-cluster HTTP smoke → 증거 코멘트.
5. candy: 아래 네 증거 그룹이 모두 있을 때만 Done.

## Pass criteria

- Done 티켓 코멘트에 `pr_url`, `merge_sha`, `workflow_run_url`, `workflow_conclusion: success`, `rollout: … OK`, `smoke: HTTP …`.
- 공장 git에 제품 소스 미포함.
- 사람이 `kubectl set image` / 수동 apply로 우회하지 않음.

## 막히면

| 증상 | 점검 |
|------|------|
| infra가 registry에 테넌트 없음 | render + infra Pod 재시작, `tenant_cd.enabled: true` |
| workflow_dispatch 실패 | 테넌트 repo Actions 권한, workflow 파일 경로=`tenant_cd.workflow` |
| smoke 실패 | `verify.smoke.url`이 infra Pod에서 라우팅 가능한지, Service/포트 |
| candy가 Done 거부 | 증거 필드 4그룹 누락 — ARCHITECTURE §2.8 |
