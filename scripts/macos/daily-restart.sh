#!/usr/bin/env bash
# LaunchAgent calendar entry: hygiene restart of cursor + gateway (local dawn).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESTART="$ROOT/scripts/macos/restart-launchagents.sh"

export PATH="${SWF_LAUNCHD_PATH:-/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin}:$PATH"

echo "{\"msg\":\"daily_restart\",\"event\":\"start\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

if [[ ! -x "$RESTART" ]]; then
  echo "{\"msg\":\"daily_restart\",\"event\":\"restart_missing\",\"path\":\"$RESTART\"}" >&2
  exit 1
fi

if "$RESTART"; then
  echo "{\"msg\":\"daily_restart\",\"event\":\"ok\"}"
else
  echo "{\"msg\":\"daily_restart\",\"event\":\"failed\"}" >&2
  exit 1
fi
