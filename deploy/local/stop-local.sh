#!/usr/bin/env bash
# Stop native stack — delegates to ../../scripts/stop-local.sh
# Docker: ./stop-docker.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$ROOT/scripts/stop-local.sh" "$@"
