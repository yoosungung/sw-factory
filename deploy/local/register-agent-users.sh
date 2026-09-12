#!/usr/bin/env bash
# Register factory users for agents.yaml (sessions + human) and rewrite user_id.
# Idempotent: email_taken → login (needs PERSONA_PASSWORD) or D1 lookup instructions.
#
# Usage (from repo root or deploy/local):
#   cd deploy/local && cp ../env.example .env   # once
#   # set PERSONA_PASSWORD (>=8) in .env
#   ./register-agent-users.sh
#
# Env:
#   FACTORY_BASE_URL  (default https://factory.askwho.net)
#   AGENTS_FILE       (default ../agents.yaml)
#   PERSONA_PASSWORD  shared password for new bot accounts
#   SKIP_HUMAN=1      skip type:human (e.g. eric already exists)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
cd "$DIR"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
FACTORY_BASE_URL="${FACTORY_BASE_URL%/}"
AGENTS_FILE="${AGENTS_FILE:-$DIR/../agents.yaml}"
PASSWORD="${PERSONA_PASSWORD:-}"

if [[ ! -f "$AGENTS_FILE" ]]; then
  echo "missing agents.yaml: $AGENTS_FILE" >&2
  exit 1
fi
if [[ -z "$PASSWORD" || ${#PASSWORD} -lt 8 ]]; then
  echo "Set PERSONA_PASSWORD (>=8 chars) in .env" >&2
  exit 1
fi

cd "$ROOT"
export FACTORY_BASE_URL AGENTS_FILE PERSONA_PASSWORD="$PASSWORD" SKIP_HUMAN="${SKIP_HUMAN:-0}"
npx tsx "$DIR/register-agent-users.ts"
