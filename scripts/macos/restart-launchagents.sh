#!/usr/bin/env bash
# Restart LaunchAgent cursor + gateway so they pick up repo code / .env.
set -euo pipefail

LABEL_PREFIX="net.askwho.sw-factory"
uid="$(id -u)"
domain="gui/${uid}"

for name in cursor gateway; do
  label="${LABEL_PREFIX}.${name}"
  if ! launchctl print "${domain}/${label}" >/dev/null 2>&1; then
    echo "not loaded: $label — run ./scripts/macos/install-launchagents.sh" >&2
    exit 1
  fi
done

# cursor first so :8080 is up before gateway catch-up
launchctl kickstart -k "${domain}/${LABEL_PREFIX}.cursor"
sleep 1
launchctl kickstart -k "${domain}/${LABEL_PREFIX}.gateway"

echo "Restarted ${LABEL_PREFIX}.cursor + .gateway (tsx reloads source from disk)."
