#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$(dirname "$0")"

# optional shared env from deploy/local/.env
LOCAL_ENV="$(cd "$(dirname "$0")/../local" && pwd)/.env"
# shellcheck disable=SC1091
[[ -f "$LOCAL_ENV" ]] && set -a && source "$LOCAL_ENV" && set +a

IMAGE="${IMAGE:-sw-factory-agent:local}"

echo "Building $IMAGE (context=$ROOT)"
docker build -f Dockerfile -t "$IMAGE" "$ROOT"
echo "OK $IMAGE"
