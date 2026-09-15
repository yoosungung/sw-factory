#!/usr/bin/env bash
# Single-container supervisor: persona seeds → ensure-repos → cursor → gateway.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
AGENTS_YAML="${AGENTS_YAML:-/config/agents.yaml}"
FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
PERSONA_SEED_DIR="${PERSONA_SEED_DIR:-/opt/persona-seed}"
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
export PERSONA_SEED_DIR

pids=()

term() {
  for pid in "${pids[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait || true
}
trap term SIGTERM SIGINT

cd /app

# Prepared seeds (/opt/persona-seed) → /data/workspaces/{persona}
# Skip: APPLY_PERSONA_SEEDS=0
if [[ "${APPLY_PERSONA_SEEDS:-1}" != "0" && -d "$PERSONA_SEED_DIR" ]]; then
  echo "{\"msg\":\"persona_seeds_start\",\"seedDir\":\"$PERSONA_SEED_DIR\"}"
  npx tsx agent/cursor/src/apply-persona-seeds-cli.ts \
    --seed-dir "$PERSONA_SEED_DIR" \
    --data-dir "$DATA_DIR"
  echo "{\"msg\":\"persona_seeds_done\"}"
fi

# PVC repos: clone-if-missing / fetch (agents.yaml repos[] + primary_repo/repo_ids).
# Skip: ENSURE_REPOS=0. Private: GH_TOKEN or GITHUB_TOKEN.
if [[ "${ENSURE_REPOS:-1}" != "0" ]]; then
  echo "{\"msg\":\"ensure_repos_start\",\"config\":\"$AGENTS_YAML\"}"
  npx tsx agent/cursor/src/ensure-repos-cli.ts \
    --config "$AGENTS_YAML" \
    --data-dir "$DATA_DIR"
  echo "{\"msg\":\"ensure_repos_done\"}"
fi

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
