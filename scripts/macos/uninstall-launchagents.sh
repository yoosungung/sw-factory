#!/usr/bin/env bash
# Unload and remove sw-factory LaunchAgents.
set -euo pipefail

LABEL_PREFIX="net.askwho.sw-factory"
AGENTS_DIR="${HOME}/Library/LaunchAgents"
uid="$(id -u)"
domain="gui/${uid}"

for name in cursor gateway git-head-watch; do
  label="${LABEL_PREFIX}.${name}"
  plist="${AGENTS_DIR}/${label}.plist"
  launchctl bootout "${domain}/${label}" 2>/dev/null || true
  rm -f "$plist"
  echo "Removed $label"
done

echo "LaunchAgents stopped."
