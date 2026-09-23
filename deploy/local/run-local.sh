#!/usr/bin/env bash
# cwd 편의 → scripts/run-local.sh  (예: ./run-local.sh remote-ticket)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$ROOT/scripts/run-local.sh" "$@"
