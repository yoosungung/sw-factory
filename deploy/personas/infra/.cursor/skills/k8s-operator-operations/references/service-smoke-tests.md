# In-cluster Service smoke tests

Combine object checks with a real request from the operator pod (DNS + ClusterIP + app response). Prefer this over trusting readiness alone; `pods/exec` not required.

```bash
kubectl get svc -n <namespace> <service> -o wide
kubectl get endpoints -n <namespace> <service> -o wide || true
kubectl get endpointslice -n <namespace> -l kubernetes.io/service-name=<service> -o wide || true

curl -sS --connect-timeout 5 --max-time 20 \
  http://<service>.<namespace>.svc.cluster.local:<port>/<health-or-api-path>
```

TCP-only:

```bash
python3 - <<'PY'
import socket
for host, port in [('<service>.<namespace>.svc.cluster.local', 5432)]:
    s = socket.socket(); s.settimeout(5)
    try:
        s.connect((host, port)); print(f'{host}:{port} OK')
    except Exception as e:
        print(f'{host}:{port} FAIL {e}')
    finally:
        s.close()
PY
```

## Pitfalls

- Exec readiness can be a false positive (e.g. Redis `redis-cli ping` on loopback while pod IP refuses connections). Flag as reachability issue only when the Service is expected to be reachable from the probe path.
- For `runtime` namespace: failed access from operator pods may be intentional policy — do not flag unless readiness/app health/declared routes fail.
- OpenAI-compatible (SGLang): `/v1/models` then tiny `/v1/chat/completions` with small `max_tokens`. 401/403 can still prove DNS/routing; 200 + completion proves serving health. If 405, verify HTTP method (POST for JSON bodies).
- Protected data services: unauthenticated readiness first (e.g. Qdrant `/readyz`). 401 on `/collections` proves auth protection, not health failure.
