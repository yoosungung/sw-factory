# Health checks

Adapt namespace filters to the operating target (default: full discovery, then focus on known workloads).

```bash
kubectl config current-context || true
kubectl get nodes -o wide
kubectl get ns
kubectl get pods -A -o wide
kubectl get deploy,statefulset,daemonset -A
kubectl get svc,ingress,endpoints -A
kubectl get pv,pvc -A
kubectl get events -A --sort-by=.lastTimestamp | tail -80
```

## Abnormal pods

```bash
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded
kubectl describe pod -n <ns> <pod>
kubectl logs -n <ns> <pod> --tail=200 --previous || true
kubectl logs -n <ns> <pod> --tail=200 || true
```

## PV/PVC

```bash
kubectl describe pvc -n <ns> <pvc>
kubectl describe pv <pv>
kubectl get storageclass
kubectl get volumeattachments
```

## Read-only monitoring defaults

Separate repo/manifest findings, live cluster findings, and access/tooling limitations. Missing local tools ≠ cluster failure.

For local-path storage, GPU serving, or prior DiskPressure: prefer **daily** reports. Include abnormal pods, rollouts, endpoints, ingress, PV/PVC, node pressure, metrics-server, GPU allocation, recent Warning events.

For SGLang/vLLM/Ollama OpenAI-compatible stacks: rollout, logs (KV/OOM/CUDA), svc/endpoints/ingress, `/v1/models`, tiny completion when safe.
