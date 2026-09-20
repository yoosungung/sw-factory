# Agent Kubernetes (NS=`sw-factory`)

클러스터 매니페스트만. 이미지: [../docker/](../docker/) · 로컬: [../local/](../local/).  
agents 설정 정본: [`../agents.yaml`](../agents.yaml) (없으면 [`../agents.yaml.example`](../agents.yaml.example)). `apply.sh`가 ConfigMap으로 적용.

## Repo clone (PVC)

kubelet `gitRepo` 볼륨은 쓰지 않는다(보안·1.36 제거). **앱과 동일 로직**으로 ensure:

| 경로 | 언제 | 무엇을 |
|------|------|--------|
| Pod **entrypoint** persona seeds | 매 기동 (`APPLY_PERSONA_SEEDS=1`, 기본) | `/opt/persona-seed/{persona}` → `/data/workspaces/{persona}` (MEMORY seed-once · skills overwrite) |
| Pod **entrypoint** `seed-cookies-cli` | 매 기동 (`SEED_PERSONA_COOKIES=1`, 기본) | sessions persona마다 factory 로그인 → `secrets/session.cookie` + `.cursor/mcp.json`. `GATEWAY_SESSION_COOKIE`는 폴링 전용(공유 금지) |
| Pod **entrypoint** `ensure-repos-cli` | 매 기동 (`ENSURE_REPOS=1`, 기본) | `agents.yaml` `repos[]` + `primary_repo`/`repo_ids` → `/data/workspaces/{persona}/repos/{id}` clone-if-missing·fetch · registry 기록 |
| **Job** `job-seed-personas.yaml` | 번들·ensure를 쿠키와 한 번에 | factory 로그인 + prepared seed + ensure (로컬 `seed-personas.sh`와 유사). 쿠키만이면 Pod 재시작으로 충분 |

Secret에 `GH_TOKEN`(private HTTPS). public만이면 생략 가능. 끄기: `ENSURE_REPOS=0`.

```bash
cd deploy/docker && ./build.sh
# 레지스트리 push 후:
export IMAGE=your-registry/sw-factory-agent:tag

kubectl -n sw-factory create secret generic sw-factory-agent \
  --from-literal=GATEWAY_SESSION_COOKIE='lt_session=…' \
  --from-literal=CURSOR_API_KEY='…' \
  --from-literal=GH_TOKEN='ghp_…' \
  --from-literal=PERSONA_PASSWORD='…' \
  --dry-run=client -o yaml | kubectl apply -f -

cd ../k8s && ./apply.sh
# 커스텀: AGENTS_FILE=/path/to/agents.yaml ./apply.sh

# 쿠키는 Pod 재시작(SEED_PERSONA_COOKIES)으로 다시 로그인한다.
# 번들+ensure를 Job으로 한 번에 할 때만:
#   sed "s|image: sw-factory-agent:local|image: ${IMAGE}|" job-seed-personas.yaml | kubectl apply -f -
```

| 파일 | 역할 |
|------|------|
| `namespace.yaml` | `sw-factory` |
| `pvc.yaml` | `/data` PVC |
| `deployment.yaml` | gateway+cursor 1 Pod · `PERSONA_PASSWORD` · `GH_TOKEN` · `ENSURE_REPOS` |
| `job-seed-personas.yaml` | 쿠키+번들+ensure one-shot Job |
| `secret.example.yaml` | Secret 참고 (커밋 값 사용 금지) |
| `apply.sh` | apply + ConfigMap from `../agents.yaml` |
