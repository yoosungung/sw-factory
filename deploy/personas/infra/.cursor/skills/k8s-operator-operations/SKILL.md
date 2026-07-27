---
name: k8s-operator-operations
description: >-
  Operate Kubernetes clusters as an in-cluster service operator: RBAC, PV/PVC
  work, health checks, kubectl remediation, and safe Korean reports. Use when
  infra monitors pods/services/PV/PVCs or runs scheduled cluster health reports.
version: 1.0.0
author: infra persona
license: MIT
---

# Kubernetes Operator Operations

infra가 클러스터 안에서 Pod/Service/PV/PVC를 모니터링하고, 필요할 때만 `kubectl`로 최소 변경한다.

세부 플레이북은 필요할 때만 읽는다:

| 파일 | 언제 |
|------|------|
| `references/operator-rbac.md` | 운영 SA RBAC 설계·검증 |
| `references/resource-monitoring-rbac.md` | metrics/top/kubelet stats |
| `references/health-checks.md` | 일상 헬스·이상 Pod 점검 |
| `references/service-smoke-tests.md` | in-cluster HTTP/TCP 스모크 |
| `references/deployment-patches.md` | Deployment 안전 패치 |
| `references/postgres-temp-diskpressure.md` | DiskPressure·pgsql_tmp |
| `references/argo-partial-rbac.md` | Argo/BFF 부분 RBAC closeout |
| `references/scheduled-reports.md` | 일일 리포트·스케줄 |
| `references/incident-tickets.md` | 장애→Leantime 티켓 (M9 LOOP #2) |

**Tenant CD (post-merge deploy):** use sibling skill `tenant-cd` when the ticket asks for deploy/smoke after merge (`tenant_cd` / `workflow_dispatch`). Do **not** run tenant CD during `infra-k8s-daily` (read-only).

Daily reports that find actionable CrashLoop/rollout/PV faults: follow `references/incident-tickets.md` (ticket create/update only — still no cluster mutate on the schedule).
## Operating posture

1. **Confirm scope first**: target repo(`k8s-test`), namespace(s), cluster identity, 변경 허용 여부. Eric이 배포를 주로 하고, 명시적으로 위임할 때만 mutate.
2. **Prefer read-only checks by default** unless the user asks for operations/remediation.
3. **Mutating actions**: 대상·의도를 확인한 뒤 최소 변경. PV/PVC delete/rebind, StorageClass, node taints, workload delete는 고위험 — 의도·증거를 명확히 요약.
4. **Report concisely in Korean for Eric** unless a different format is requested.
5. **Ownership vs capability**: route by who can execute the next step (`can-i`/403), not by role nickname. Do not hand cluster privilege gaps to candy (app PM/reviewer). Agent-denied platform/policy/apply → `@eric` + `Waiting for Approval`.

## In-cluster kubectl

agent-runner 이미지에 `kubectl`이 포함된다. in-cluster SA가 기본이다. context가 비어 `localhost:8080`으로 가면 임시 kubeconfig를 만든다(토큰 출력 금지):

```bash
export KUBECONFIG=/tmp/incluster-kubeconfig
rm -f "$KUBECONFIG"
kubectl config set-cluster in-cluster \
  --server="https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT}" \
  --certificate-authority=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  --embed-certs=true
kubectl config set-credentials service-account \
  --token="$(tr -d '\n' </var/run/secrets/kubernetes.io/serviceaccount/token)"
kubectl config set-context in-cluster --cluster=in-cluster --user=service-account
kubectl config use-context in-cluster
```

작업 후 임시 파일 삭제. 권한 확인:

```bash
kubectl auth can-i list pods -A
kubectl auth can-i get nodes
kubectl auth can-i patch persistentvolumes
kubectl auth can-i patch persistentvolumeclaims -A
```

권한 부여 후 확인 절차는 `references/operator-rbac.md`.

## Health-check routine

```bash
kubectl get nodes -o wide
kubectl get ns
kubectl get pods -A -o wide
kubectl get deploy,statefulset,daemonset -A
kubectl get svc,ingress,endpoints -A
kubectl get pv,pvc -A
kubectl get events -A --sort-by=.lastTimestamp | tail -80
```

이상 Pod:

```bash
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded
kubectl describe pod -n <ns> <pod>
kubectl logs -n <ns> <pod> --tail=200 --previous || true
kubectl logs -n <ns> <pod> --tail=200 || true
```

상세·스모크·DiskPressure·Argo는 해당 references를 따른다.

## Scheduled report format

```text
k8s 운영 리포트 - YYYY-MM-DD
상태 요약: 정상/주의/장애/접근불가

주요 발견사항
- ...

PV/PVC 상태
- ...

조치 권장사항
- ...

Eric 확인 필요
- ...
```

`kubectl`은 있으나 RBAC이 막히면: API/client 가능 vs `auth can-i`/Forbidden 권한 부족을 구분한다. RBAC write(`roles`/`clusterroles` 등)는 부여·사용하지 않는다.
