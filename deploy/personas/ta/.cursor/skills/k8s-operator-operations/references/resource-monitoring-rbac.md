# Resource monitoring RBAC

## metrics-server

```bash
kubectl auth can-i list nodes.metrics.k8s.io
kubectl auth can-i list pods.metrics.k8s.io
kubectl top nodes
kubectl top pods -A
```

`kubectl auth can-i get nodes/metrics` alone is not enough for metrics-server.

## kubelet stats (nodefs / imagefs / volume)

Requires `get` on `nodes/proxy` (and often `nodes/stats` / `nodes/metrics`):

```bash
NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
kubectl get --raw "/api/v1/nodes/${NODE}/proxy/stats/summary" | python3 -c '
import json,sys
s=json.load(sys.stdin)
nf=s["node"]["fs"]
print("nodefs used%={:.1f}".format(100*nf["usedBytes"]/nf["capacityBytes"]))
'
```

Do not print tokens or full secret values when pulling credentials for SQL checks.

## GPU

- Inventory: node `nvidia.com/gpu` capacity/allocatable + pod requests/limits.
- Utilization: DCGM exporter / node exporter / controlled `nvidia-smi` only.
- Missing DCGM: prepare `gpu-operator` + `dcgm-exporter` DaemonSet/ClusterIP under `manifests/infra/`, `kubectl apply --dry-run=client`, ask Eric/admin to apply.
