#!/usr/bin/env bash
# Poll git HEAD; on change restart cursor+gateway LaunchAgents (after pull/checkout).
# Env: SWF_GIT_HEAD_POLL_SEC (default 60)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOLS="${LOCAL_TOOLS_DIR:-$ROOT/.tools}"
LOG_DIR="${LOG_DIR:-$TOOLS/local-logs}"
STATE_FILE="${SWF_GIT_HEAD_STATE:-$TOOLS/git-head.watch}"
INTERVAL="${SWF_GIT_HEAD_POLL_SEC:-60}"
RESTART="$ROOT/scripts/macos/restart-launchagents.sh"

# shellcheck disable=SC1091
source "$ROOT/scripts/macos/launch-env.sh"
load_launch_env

mkdir -p "$TOOLS" "$LOG_DIR"
cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "{\"msg\":\"git_head_watch\",\"error\":\"not_a_git_repo\",\"root\":\"$ROOT\"}" >&2
  exit 1
fi

current_head() {
  git rev-parse HEAD 2>/dev/null
}

last="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [[ -z "$last" ]]; then
  last="$(current_head)"
  printf '%s\n' "$last" >"$STATE_FILE"
  echo "{\"msg\":\"git_head_watch\",\"event\":\"armed\",\"head\":\"$last\",\"interval_sec\":$INTERVAL}"
fi

while true; do
  sleep "$INTERVAL"
  now="$(current_head)" || {
    echo "{\"msg\":\"git_head_watch\",\"event\":\"rev_parse_failed\"}" >&2
    continue
  }
  if [[ "$now" == "$last" ]]; then
    continue
  fi
  echo "{\"msg\":\"git_head_watch\",\"event\":\"head_changed\",\"from\":\"$last\",\"to\":\"$now\"}"
  if [[ -x "$RESTART" ]]; then
    if "$RESTART"; then
      echo "{\"msg\":\"git_head_watch\",\"event\":\"restart_ok\",\"head\":\"$now\"}"
    else
      echo "{\"msg\":\"git_head_watch\",\"event\":\"restart_failed\",\"head\":\"$now\"}" >&2
      # Still advance cursor so we do not tight-loop the same transition.
    fi
  else
    echo "{\"msg\":\"git_head_watch\",\"event\":\"restart_missing\",\"path\":\"$RESTART\"}" >&2
  fi
  last="$now"
  printf '%s\n' "$last" >"$STATE_FILE"
done
