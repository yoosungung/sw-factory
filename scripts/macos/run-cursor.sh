#!/usr/bin/env bash
# LaunchAgent entry: cursor runner (KeepAlive-friendly). Sources deploy/local/.env.
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

if [[ ! -f "$CONFIG" ]]; then
  echo "missing agents.yaml: $CONFIG" >&2
  exit 1
fi

mkdir -p "$DATA_DIR" "$LOG_DIR"
cd "$ROOT"

use_mock=1
if [[ -n "${CURSOR_API_KEY:-}" && "${AGENT_BACKEND:-}" != "mock" && "${FORCE_MOCK:-0}" != "1" ]]; then
  use_mock=0
fi

args=(
  "$ROOT/node_modules/.bin/tsx"
  "$ROOT/agent/cursor/src/cli.ts"
  --config "$CONFIG"
  --data-dir "$DATA_DIR"
)
if [[ "$use_mock" == "1" ]]; then
  args+=(--mock)
fi

exec "${args[@]}"
