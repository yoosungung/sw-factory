#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$(cd "$DIR/.." && pwd)"
NS="${NS:-${NAMESPACE:-sw-factory}}"
AGENTS_SRC="${AGENTS_FILE:-$DEPLOY/agents.yaml}"

if [[ "$NS" != "sw-factory" ]]; then
  echo "This chart is fixed to namespace sw-factory (got NS=$NS)" >&2
  exit 1
fi

if [[ ! -f "$AGENTS_SRC" ]]; then
  echo "missing agents yaml: $AGENTS_SRC" >&2
  exit 1
fi

kubectl apply -f "$DIR/namespace.yaml"
kubectl apply -f "$DIR/pvc.yaml"

kubectl -n "$NS" create configmap sw-factory-agents \
  --from-file=agents.yaml="$AGENTS_SRC" \
  --dry-run=client -o yaml | kubectl apply -f -

if [[ -n "${IMAGE:-}" ]]; then
  sed "s|image: sw-factory-agent:local|image: ${IMAGE}|" "$DIR/deployment.yaml" \
    | kubectl apply -f -
else
  kubectl apply -f "$DIR/deployment.yaml"
fi

kubectl -n "$NS" rollout status deployment/sw-factory-agent --timeout=120s
echo "OK namespace=$NS agents=$AGENTS_SRC"
