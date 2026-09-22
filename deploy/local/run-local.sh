#!/usr/bin/env bash
# Native (no Docker) stack — delegates to ../../scripts/run-local.sh
# Docker: ./run-docker.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$ROOT/scripts/run-local.sh" "$@"
