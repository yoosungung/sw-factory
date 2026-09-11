#!/usr/bin/env bash
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
