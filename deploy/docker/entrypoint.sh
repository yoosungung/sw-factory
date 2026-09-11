#!/usr/bin/env bash
# Single-container supervisor: cursor listen, then gateway poll.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
AGENTS_YAML="${AGENTS_YAML:-/config/agents.yaml}"
FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
CURSOR_ARGS=(--config "$AGENTS_YAML" --data-dir "$DATA_DIR")
GATEWAY_DATA_DIR="${GATEWAY_DATA_DIR:-$DATA_DIR/gateway}"

if [[ ! -f "$AGENTS_YAML" ]]; then
  echo "missing agents.yaml: $AGENTS_YAML" >&2
  exit 1
fi

if [[ -z "${GATEWAY_SESSION_COOKIE:-}${FACTORY_SESSION_COOKIE:-}" ]]; then
  echo "Set GATEWAY_SESSION_COOKIE (lt_session=…)" >&2
  exit 1
fi

mkdir -p "$DATA_DIR/gateway" "$DATA_DIR/workspaces" "$DATA_DIR/shared/tool-cache"

export FACTORY_BASE_URL
export DATA_DIR
export AGENTS_YAML

pids=()

term() {
  for pid in "${pids[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait || true
}
trap term SIGTERM SIGINT

cd /app

cursor_cmd=(npx tsx agent/cursor/src/cli.ts "${CURSOR_ARGS[@]}")
if [[ "${AGENT_BACKEND:-}" == "mock" ]]; then
  cursor_cmd+=(--mock)
fi

echo "{\"msg\":\"entrypoint_start\",\"factory\":\"$FACTORY_BASE_URL\",\"dataDir\":\"$DATA_DIR\"}"

"${cursor_cmd[@]}" &
pids+=($!)

# brief wait so listen binds before gateway polls
sleep 1

npx tsx agent/gateway/src/cli.ts \
  --config "$AGENTS_YAML" \
  --data-dir "$GATEWAY_DATA_DIR" &
pids+=($!)

# exit if any child dies
set +e
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid"
      code=$?
      echo "{\"msg\":\"child_exit\",\"pid\":$pid,\"code\":$code}" >&2
      term
      exit "$code"
    fi
  done
  sleep 2
done
