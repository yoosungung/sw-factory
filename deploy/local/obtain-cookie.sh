#!/usr/bin/env bash
# Login to FACTORY_BASE_URL and write GATEWAY_SESSION_COOKIE into .env
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
FACTORY_BASE_URL="${FACTORY_BASE_URL%/}"
EMAIL="${FACTORY_LOGIN_EMAIL:-}"
PASSWORD="${FACTORY_LOGIN_PASSWORD:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Set FACTORY_LOGIN_EMAIL and FACTORY_LOGIN_PASSWORD in .env (from ../env.example)" >&2
  exit 1
fi

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()), end="")'
}

PAYLOAD=$(printf '{"email":%s,"password":%s}' \
  "$(json_escape "$EMAIL")" "$(json_escape "$PASSWORD")")

JAR="$(mktemp)"
RESP="$(mktemp)"
trap 'rm -f "$JAR" "$RESP"' EXIT

HTTP=$(curl -sS -o "$RESP" -w '%{http_code}' -c "$JAR" \
  -X POST "$FACTORY_BASE_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "$PAYLOAD")

if [[ "$HTTP" != "200" ]]; then
  echo "login failed HTTP $HTTP: $(cat "$RESP")" >&2
  exit 1
fi

COOKIE=$(awk '$6 == "lt_session" { print "lt_session=" $7 }' "$JAR" | tail -1)
if [[ -z "$COOKIE" ]]; then
  COOKIE=$(curl -sS -D - -o /dev/null \
    -X POST "$FACTORY_BASE_URL/api/auth/login" \
    -H 'content-type: application/json' \
    -d "$PAYLOAD" \
    | tr -d '\r' \
    | awk -F'[=; ]' 'tolower($1) == "set-cookie:" && $2 == "lt_session" { print "lt_session=" $3; exit }')
fi

if [[ -z "$COOKIE" ]]; then
  echo "login ok but no lt_session cookie" >&2
  exit 1
fi

ENV_FILE="$DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$DIR/../env.example" "$ENV_FILE"
fi

awk -v c="$COOKIE" '
  BEGIN { done = 0 }
  /^GATEWAY_SESSION_COOKIE=/ { print "GATEWAY_SESSION_COOKIE=" c; done = 1; next }
  { print }
  END { if (!done) print "GATEWAY_SESSION_COOKIE=" c }
' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"

echo "Wrote GATEWAY_SESSION_COOKIE to .env (HTTP $HTTP)"
