#!/usr/bin/env bash
# Restart LaunchAgent cursor + gateway so they pick up repo code / .env.
# Clears gateway sticky.json first — in-memory agent_ids die with the process.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_DIR="$ROOT/deploy/local"
ENV_FILE="$LOCAL_DIR/.env"
LABEL_PREFIX="net.askwho.sw-factory"
uid="$(id -u)"
domain="gui/${uid}"

# shellcheck disable=SC1091
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

DATA_DIR="${DATA_DIR:-${DATA_HOST:-$LOCAL_DIR/.local-data}}"
STICKY="$DATA_DIR/gateway/sticky.json"

for name in cursor gateway; do
  label="${LABEL_PREFIX}.${name}"
  if ! launchctl print "${domain}/${label}" >/dev/null 2>&1; then
    echo "not loaded: $label — run ./scripts/macos/install-launchagents.sh" >&2
    exit 1
  fi
done

if [[ -f "$STICKY" ]]; then
  printf '%s\n' '{}' >"$STICKY"
  echo "Cleared sticky: $STICKY"
fi

# cursor first so :8080 is up before gateway catch-up
launchctl kickstart -k "${domain}/${LABEL_PREFIX}.cursor"
sleep 1
launchctl kickstart -k "${domain}/${LABEL_PREFIX}.gateway"

echo "Restarted ${LABEL_PREFIX}.cursor + .gateway (tsx reloads source from disk)."
