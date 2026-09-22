#!/usr/bin/env bash
# Stop agent container started by run-docker.sh. Native: ../../scripts/stop-local.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

NAME="${CONTAINER_NAME:-sw-factory-agent}"

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME"
  echo "Stopped $NAME"
else
  echo "No container named $NAME"
fi
