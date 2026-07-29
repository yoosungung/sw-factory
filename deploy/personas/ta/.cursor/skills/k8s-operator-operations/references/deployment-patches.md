# Deployment stabilization patches

Avoid JSON merge patches that replace the entire `containers` list with a partial object — that drops required fields like `image` (`spec.template.spec.containers[0].image: Required value`).

Safer patterns:

1. `kubectl set image`, `kubectl set env`, or `kubectl patch --type strategic` for simple field changes.
2. Complex command/probe edits: fetch live Deployment JSON, strip `status`/`managedFields`, mutate the existing container in Python, then `kubectl replace -f /tmp/deploy.json`.
3. After mutate: `kubectl rollout status deployment/<name> -n <namespace> --timeout=<bounded>` then re-check pods/endpoints/logs.
