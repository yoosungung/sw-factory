#!/usr/bin/env bash
# Stop native local stack started by scripts/run-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${LOCAL_TOOLS_DIR:-$ROOT/.tools}"
PID_DIR="${PID_DIR:-$TOOLS/local-pids}"

kill_tree() {
  local pid="$1"
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  local kids
  kids="$(pgrep -P "$pid" 2>/dev/null || true)"
  if [[ -n "$kids" ]]; then
    local c
    for c in $kids; do
      kill_tree "$c"
    done
  fi
  kill "$pid" 2>/dev/null || true
}

stopped=0
if [[ -d "$PID_DIR" ]]; then
  for f in "$PID_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f" 2>/dev/null || true)"
    name="$(basename "$f" .pid)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)"
      kill_tree "$pid"
      # wait briefly then force
      for _ in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        kids="$(pgrep -P "$pid" 2>/dev/null || true)"
        [[ -n "$kids" ]] && kill -9 $kids 2>/dev/null || true
      fi
      stopped=1
    fi
    rm -f "$f"
  done
fi

if [[ "$stopped" -eq 0 ]]; then
  echo "No native local pids under $PID_DIR"
else
  echo "Stopped native local stack"
fi
