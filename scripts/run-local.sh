#!/usr/bin/env bash
# Native (no Docker) stack: Vite + agent:cursor + agent:gateway
# Uses deploy/local/.env + .local-data (same as Docker). Docker: deploy/local/run-docker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCAL_DIR="$ROOT/deploy/local"
DEPLOY="$ROOT/deploy"
TOOLS="${LOCAL_TOOLS_DIR:-$ROOT/.tools}"
PID_DIR="${PID_DIR:-$TOOLS/local-pids}"
LOG_DIR="${LOG_DIR:-$TOOLS/local-logs}"
ENV_FILE="$LOCAL_DIR/.env"

# shellcheck disable=SC1091
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

DATA_DIR="${DATA_DIR:-${DATA_HOST:-$LOCAL_DIR/.local-data}}"
CONFIG="${AGENTS_FILE:-$DEPLOY/agents.yaml}"
# Same default as Docker / deploy/env.example. Local Vite: FACTORY_BASE_URL=http://localhost:5173
FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"
SKIP_AGENT="${SKIP_AGENT:-0}"
SKIP_VITE="${SKIP_VITE:-0}"
SEED_PERSONA_COOKIES="${SEED_PERSONA_COOKIES:-0}"
ENSURE_REPOS="${ENSURE_REPOS:-0}"

mkdir -p "$DATA_DIR" "$DATA_DIR/gateway" "$PID_DIR" "$LOG_DIR"

if [[ ! -d node_modules ]]; then
  echo "node_modules missing — run: npm install" >&2
  exit 1
fi

if [[ ! -f .dev.vars ]]; then
  if [[ -f .dev.vars.example ]]; then
    cp .dev.vars.example .dev.vars
    echo "Created .dev.vars from .dev.vars.example"
  else
    echo "Missing .dev.vars" >&2
    exit 1
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$DEPLOY/env.example" ]]; then
    cp "$DEPLOY/env.example" "$ENV_FILE"
    set -a && source "$ENV_FILE" && set +a
    FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
    echo "Created $ENV_FILE (FACTORY_BASE_URL=$FACTORY_BASE_URL)"
  else
    echo "Missing $ENV_FILE — cp deploy/env.example deploy/local/.env" >&2
    exit 1
  fi
fi

is_local_factory=0
case "$FACTORY_BASE_URL" in
  http://localhost:*|http://127.0.0.1:*) is_local_factory=1 ;;
esac
# Remote factory: skip local D1 migrate unless explicitly forced (SKIP_MIGRATE=0 + LOCAL_MIGRATE=1).
if [[ "$is_local_factory" != "1" && "${LOCAL_MIGRATE:-0}" != "1" ]]; then
  SKIP_MIGRATE=1
fi
# Remote: Vite is optional (agents hit remote). Local factory keeps Vite on.
if [[ "$is_local_factory" != "1" && "${START_VITE:-0}" != "1" ]]; then
  SKIP_VITE=1
fi

if [[ ! -f "$CONFIG" ]]; then
  if [[ -f "$DEPLOY/agents.yaml.example" ]]; then
    cp "$DEPLOY/agents.yaml.example" "$CONFIG"
    echo "Created $CONFIG from agents.yaml.example — edit user_id/email"
  else
    echo "missing agents.yaml: $CONFIG" >&2
    exit 1
  fi
fi

if [[ -x "$ROOT/scripts/stop-local.sh" ]]; then
  "$ROOT/scripts/stop-local.sh" >/dev/null 2>&1 || true
fi

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  echo "Applying local D1 migrations…"
  npm run db:migrate:local
fi

use_mock=1
if [[ -n "${CURSOR_API_KEY:-}" && "${AGENT_BACKEND:-}" != "mock" && "${FORCE_MOCK:-0}" != "1" ]]; then
  use_mock=0
fi

echo "Factory → $FACTORY_BASE_URL"
if [[ "$SKIP_VITE" != "1" ]]; then
  echo "Starting Vite → http://localhost:5173"
  ./node_modules/.bin/vite >"$LOG_DIR/vite.log" 2>&1 &
  echo $! >"$PID_DIR/vite.pid"
fi

# Prefer GATEWAY_SESSION_COOKIE from deploy/local/.env (obtain-cookie.sh).
# If empty and factory is localhost, mint debug-gateway cookie into .env.
cookie="${GATEWAY_SESSION_COOKIE:-${FACTORY_SESSION_COOKIE:-}}"
if [[ -z "$cookie" ]]; then
  if [[ "$is_local_factory" == "1" ]]; then
    if [[ "$SKIP_VITE" == "1" ]]; then
      echo "local factory needs Vite for debug session — unset SKIP_VITE" >&2
      exit 1
    fi
    echo "GATEWAY_SESSION_COOKIE empty — obtaining local debug session → $ENV_FILE"
    export FACTORY_BASE_URL
    DEBUG_ENV_FILE="$(mktemp)"
    export DEBUG_ENV_FILE
    npx tsx .vscode/ensure-session.ts
    # shellcheck disable=SC1090
    set -a && source "$DEBUG_ENV_FILE" && set +a
    cookie="${GATEWAY_SESSION_COOKIE:-}"
    rm -f "$DEBUG_ENV_FILE"
    if [[ -z "$cookie" ]]; then
      echo "failed to obtain GATEWAY_SESSION_COOKIE" >&2
      "$ROOT/scripts/stop-local.sh" >/dev/null 2>&1 || true
      exit 1
    fi
    awk -v c="$cookie" '
      BEGIN { done = 0 }
      /^GATEWAY_SESSION_COOKIE=/ { print "GATEWAY_SESSION_COOKIE=" c; done = 1; next }
      { print }
      END { if (!done) print "GATEWAY_SESSION_COOKIE=" c }
    ' "$ENV_FILE" >"$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    export GATEWAY_SESSION_COOKIE="$cookie"
  else
    echo "GATEWAY_SESSION_COOKIE empty — set in deploy/local/.env or run deploy/local/obtain-cookie.sh" >&2
    "$ROOT/scripts/stop-local.sh" >/dev/null 2>&1 || true
    exit 1
  fi
fi

if [[ "$SKIP_AGENT" != "1" ]]; then
  if [[ "$SEED_PERSONA_COOKIES" == "1" ]]; then
    echo "Seeding persona cookies → $DATA_DIR"
    ./node_modules/.bin/tsx "$ROOT/agent/cursor/src/seed-cookies-cli.ts" \
      --config "$CONFIG" \
      --data-dir "$DATA_DIR"
  fi
  if [[ "$ENSURE_REPOS" == "1" ]]; then
    echo "Ensuring repos → $DATA_DIR"
    ./node_modules/.bin/tsx "$ROOT/agent/cursor/src/ensure-repos-cli.ts" \
      --config "$CONFIG" \
      --data-dir "$DATA_DIR"
  fi

  cursor_args=(
    "$ROOT/agent/cursor/src/cli.ts"
    --config "$CONFIG"
    --data-dir "$DATA_DIR"
  )
  if [[ "$use_mock" == "1" ]]; then
    cursor_args+=(--mock)
    echo "Starting agent:cursor (mock)"
  else
    echo "Starting agent:cursor (SDK)"
  fi
  ./node_modules/.bin/tsx "${cursor_args[@]}" >"$LOG_DIR/cursor.log" 2>&1 &
  echo $! >"$PID_DIR/cursor.pid"

  export FACTORY_BASE_URL GATEWAY_SESSION_COOKIE="$cookie"
  echo "Starting agent:gateway"
  ./node_modules/.bin/tsx \
    "$ROOT/agent/gateway/src/cli.ts" \
    --config "$CONFIG" \
    --data-dir "$DATA_DIR/gateway" \
    >"$LOG_DIR/gateway.log" 2>&1 &
  echo $! >"$PID_DIR/gateway.pid"
fi

echo
echo "Local stack up (no Docker)."
echo "  factory: $FACTORY_BASE_URL"
if [[ "$SKIP_VITE" != "1" ]]; then
  echo "  vite:    http://localhost:5173"
fi
echo "  env:     $ENV_FILE"
echo "  data:    $DATA_DIR"
echo "  config:  $CONFIG"
echo "  logs:    $LOG_DIR/"
echo "  stop:    npm run local:stop  # or deploy/local/stop-local.sh"
if [[ "$SKIP_AGENT" != "1" ]]; then
  echo "  agent:   cursor=$([ "$use_mock" == "1" ] && echo mock || echo sdk)"
fi
echo
if [[ "$SKIP_VITE" != "1" ]]; then
  echo "Tail: tail -f $LOG_DIR/vite.log"
else
  echo "Tail: tail -f $LOG_DIR/gateway.log"
fi
