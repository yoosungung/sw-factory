#!/usr/bin/env bash
# Seed type:sessions personas (cookie + mcp + MEMORY/skills bundle).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
cd "$DIR"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

DEPLOY="$(cd "$DIR/.." && pwd)"
AGENTS_FILE="${AGENTS_FILE:-$DEPLOY/agents.yaml}"
DATA_HOST="${DATA_HOST:-$DIR/.local-data}"
FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"

if [[ ! -f "$AGENTS_FILE" ]]; then
  if [[ -f "$DEPLOY/agents.yaml.example" ]]; then
    cp "$DEPLOY/agents.yaml.example" "$DEPLOY/agents.yaml"
    AGENTS_FILE="$DEPLOY/agents.yaml"
    echo "Created $AGENTS_FILE — edit user_id/email then re-run"
  else
    echo "missing agents.yaml: $AGENTS_FILE" >&2
    exit 1
  fi
fi

if [[ -z "${PERSONA_PASSWORD:-}" ]] && ! env | grep -q '^PERSONA_PASSWORD_'; then
  echo "Set PERSONA_PASSWORD (shared) or PERSONA_PASSWORD_<NAME> in .env" >&2
  exit 1
fi

mkdir -p "$DATA_HOST"
cd "$ROOT"
export FACTORY_BASE_URL
npx tsx agent/cursor/src/seed-cli.ts \
  --config "$AGENTS_FILE" \
  --data-dir "$DATA_HOST" \
  --factory-url "$FACTORY_BASE_URL" \
  --personas-root "$DEPLOY/personas"
