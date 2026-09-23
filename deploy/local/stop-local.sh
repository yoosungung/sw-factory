#!/usr/bin/env bash
# cwd 편의 → scripts/stop-local.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$ROOT/scripts/stop-local.sh" "$@"
