#!/usr/bin/env bash
# LaunchAgent entry: gateway poller (KeepAlive-friendly). Sources deploy/local/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_DIR="$ROOT/deploy/local"
ENV_FILE="$LOCAL_DIR/.env"
DEPLOY="$ROOT/deploy"
TOOLS="${LOCAL_TOOLS_DIR:-$ROOT/.tools}"
LOG_DIR="${LOG_DIR:-$TOOLS/local-logs}"

# shellcheck disable=SC1091
source "$ROOT/scripts/macos/launch-env.sh"
load_launch_env "$ENV_FILE"

DATA_DIR="${DATA_DIR:-${DATA_HOST:-$LOCAL_DIR/.local-data}}"
CONFIG="${AGENTS_FILE:-$DEPLOY/agents.yaml}"
FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
cookie="${GATEWAY_SESSION_COOKIE:-${FACTORY_SESSION_COOKIE:-}}"

if [[ ! -f "$CONFIG" ]]; then
  echo "missing agents.yaml: $CONFIG" >&2
  exit 1
fi
if [[ -z "$cookie" ]]; then
  echo "GATEWAY_SESSION_COOKIE empty — set in $ENV_FILE or run deploy/local/obtain-cookie.sh" >&2
  exit 1
fi

mkdir -p "$DATA_DIR/gateway" "$LOG_DIR"
cd "$ROOT"

export FACTORY_BASE_URL
export GATEWAY_SESSION_COOKIE="$cookie"

exec "$ROOT/node_modules/.bin/tsx" \
  "$ROOT/agent/gateway/src/cli.ts" \
  --config "$CONFIG" \
  --data-dir "$DATA_DIR/gateway"
