# Operator RBAC

Built-in `view` ClusterRole alone is not enough for PV/PVC operations.

## Permission classes

- **Discovery/monitoring**: `get/list/watch` on pods, logs, events, services, endpoints/endpointslices, ingress, deployments, statefulsets, daemonsets, jobs/cronjobs, nodes, namespaces, PV, PVC, StorageClass, VolumeAttachment, snapshots.
- **Live metrics**: `get/list/watch` on `metrics.k8s.io` `nodes`/`pods` so `kubectl top` works. Test with `kubectl auth can-i list nodes.metrics.k8s.io` and `kubectl top nodes` (not only `nodes/metrics`).
- **Disk/PVC telemetry**: read-only kubelet stats via `nodes/proxy`, `nodes/stats`, `nodes/metrics` (`get`) for `/api/v1/nodes/<node>/proxy/stats/summary`. Core API alone does not give early detailed disk usage.
- **GPU**: capacity/allocatable and pod requests from core API. Utilization needs DCGM/exporter/`nvidia-smi` — do not claim utilization from core API alone. If install authority is unclear, prepare manifests under `manifests/infra/` and ask cluster-admin to apply; do not claim they are on main until `git status`/`git log`/`git ls-remote` confirm.
- **Storage remediation**: `create/patch/update/delete` on PV/PVC (and often VolumeAttachment/Snapshot).
- **Workload remediation**: `patch/update/delete` on pods/controllers; `patch/update` on scale.
- **Debug**: `pods/log` read; `pods/exec` / `pods/portforward` create only when allowed.
- **Nodes**: `patch/update` for cordon/uncordon, labels, taints.
- **Do not grant RBAC write** on roles/bindings/clusterroles/clusterrolebindings — prevents self-escalation.

## Post-grant confirmation

When Eric says permissions were granted, verify live RBAC before broader work:

```bash
export PATH="$HOME/.local/bin:$PATH"
kubectl version --client --output=yaml 2>/dev/null | sed -n '1,8p'
kubectl config current-context 2>/dev/null || true
cat /var/run/secrets/kubernetes.io/serviceaccount/namespace 2>/dev/null || true

for cmd in \
  'list pods -A' \
  'list services -A' \
  'list persistentvolumes' \
  'list persistentvolumeclaims -A' \
  'patch persistentvolumes' \
  'patch persistentvolumeclaims -A' \
  'get pods/log -A' \
  'create pods/exec -A' \
  'get nodes' \
  'patch nodes' \
  'list storageclasses' \
  'list volumeattachments'; do
  printf '%-36s ' "$cmd:"
  kubectl auth can-i $cmd 2>&1 || true
done

kubectl get nodes -o wide
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded -o wide || true
kubectl get pv
kubectl get pvc -A
```

Call out partial grants (e.g. PV patch yes, `pods/exec` no). Denied exec is a debug limitation, not a blocker for routine monitoring.
