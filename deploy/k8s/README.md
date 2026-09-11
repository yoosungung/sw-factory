# Agent Kubernetes (NS=`sw-factory`)

클러스터 매니페스트만. 이미지: [../docker/](../docker/) · 로컬: [../local/](../local/).  
agents 설정 정본 예제: [`../agents.yaml.example`](../agents.yaml.example) (`apply.sh`가 ConfigMap으로 적용).

```bash
cd deploy/docker && ./build.sh
# 레지스트리 push 후:
export IMAGE=your-registry/sw-factory-agent:tag

kubectl -n sw-factory create secret generic sw-factory-agent \
  --from-literal=GATEWAY_SESSION_COOKIE='lt_session=…' \
  --from-literal=CURSOR_API_KEY='…' \
  --dry-run=client -o yaml | kubectl apply -f -

cd ../k8s && ./apply.sh
# 커스텀: AGENTS_FILE=/path/to/agents.yaml ./apply.sh
```

| 파일 | 역할 |
|------|------|
| `namespace.yaml` | `sw-factory` |
| `pvc.yaml` | `/data` PVC |
| `deployment.yaml` | gateway+cursor 1 Pod |
| `secret.example.yaml` | Secret 참고 (커밋 값 사용 금지) |
| `apply.sh` | apply + ConfigMap from `agents.yaml.example` |
