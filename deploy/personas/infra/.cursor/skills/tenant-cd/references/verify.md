# Verify (rollout + smoke)

After workflow success, verify **in-cluster** (do not trust Actions smoke alone).

Registry: `tenant_cd.verify.namespace`, `deployment`, `timeout_sec`, `smoke.url`, `smoke.expect_status`.

Use in-cluster kubeconfig if needed (see `k8s-operator-operations` SKILL).

## Rollout

```bash
NS="<namespace>"
DEP="<deployment>"
TIMEOUT="<timeout_sec>"   # default 300

kubectl rollout status "deployment/${DEP}" -n "$NS" --timeout="${TIMEOUT}s"
kubectl get deploy,pods -n "$NS" -l "app=${DEP}" -o wide || \
  kubectl get deploy,pods -n "$NS" | head -40
```

Evidence line: `rollout: <namespace>/<deployment> OK` or failure summary (`kubectl describe` / recent events).

## HTTP smoke

Prefer Service DNS from the operator pod (see `k8s-operator-operations` skill `references/service-smoke-tests.md`):

```bash
URL="<smoke.url>"
EXPECT="<expect_status>"  # default 200

code=$(curl -sS -o /tmp/tenant-cd-smoke.body -w "%{http_code}" \
  --connect-timeout 5 --max-time 20 "$URL" || echo "000")
echo "HTTP $code for $URL"
head -c 500 /tmp/tenant-cd-smoke.body || true
test "$code" = "$EXPECT"
```

Evidence line: `smoke: HTTP <code> <url>`.

If rollout OK but smoke fails → do not mark deploy complete; comment both results and escalate if needed.
