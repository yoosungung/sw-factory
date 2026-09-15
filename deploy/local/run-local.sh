#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$(cd "$DIR/.." && pwd)"
cd "$DIR"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

IMAGE="${IMAGE:-sw-factory-agent:local}"
NAME="${CONTAINER_NAME:-sw-factory-agent}"
FACTORY_BASE_URL="${FACTORY_BASE_URL:-https://factory.askwho.net}"
AGENTS_FILE="${AGENTS_FILE:-$DEPLOY/agents.yaml}"
DATA_HOST="${DATA_HOST:-$DIR/.local-data}"
BUILD_SH="$DEPLOY/docker/build.sh"

if [[ ! -f .env ]]; then
  echo "Missing .env — cp $DEPLOY/env.example .env and fill GATEWAY_SESSION_COOKIE" >&2
  exit 1
fi

if [[ -z "${GATEWAY_SESSION_COOKIE:-}${FACTORY_SESSION_COOKIE:-}" ]]; then
  echo "GATEWAY_SESSION_COOKIE empty — set in .env or run ./obtain-cookie.sh" >&2
  exit 1
fi

if [[ ! -f "$AGENTS_FILE" ]]; then
  if [[ -f "$DEPLOY/agents.yaml.example" ]]; then
    cp "$DEPLOY/agents.yaml.example" "$DEPLOY/agents.yaml"
    AGENTS_FILE="$DEPLOY/agents.yaml"
    echo "Created $AGENTS_FILE from agents.yaml.example — edit user_id/email"
  else
    echo "missing agents.yaml: $AGENTS_FILE" >&2
    exit 1
  fi
fi

mkdir -p "$DATA_HOST"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Image $IMAGE missing — building via $BUILD_SH"
  "$BUILD_SH"
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Removing existing container $NAME"
  docker rm -f "$NAME" >/dev/null
fi

ENV_ARGS=(
  -e "FACTORY_BASE_URL=$FACTORY_BASE_URL"
  -e "GATEWAY_SESSION_COOKIE=${GATEWAY_SESSION_COOKIE:-${FACTORY_SESSION_COOKIE:-}}"
  -e "DATA_DIR=/data"
  -e "AGENTS_YAML=/config/agents.yaml"
  -e "ENSURE_REPOS=${ENSURE_REPOS:-1}"
)

if [[ -n "${CURSOR_API_KEY:-}" ]]; then
  ENV_ARGS+=(-e "CURSOR_API_KEY=$CURSOR_API_KEY")
fi
if [[ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
  ENV_ARGS+=(-e "GH_TOKEN=${GH_TOKEN:-$GITHUB_TOKEN}")
fi
if [[ -n "${APPLY_PERSONA_SEEDS:-}" ]]; then
  ENV_ARGS+=(-e "APPLY_PERSONA_SEEDS=$APPLY_PERSONA_SEEDS")
fi
if [[ -n "${PERSONA_SEED_DIR:-}" ]]; then
  ENV_ARGS+=(-e "PERSONA_SEED_DIR=$PERSONA_SEED_DIR")
fi
if [[ -n "${AGENT_BACKEND:-}" ]]; then
  ENV_ARGS+=(-e "AGENT_BACKEND=$AGENT_BACKEND")
fi

echo "Starting $NAME → $FACTORY_BASE_URL (data=$DATA_HOST)"
docker run -d \
  --name "$NAME" \
  --init \
  "${ENV_ARGS[@]}" \
  -v "$DATA_HOST:/data" \
  -v "$AGENTS_FILE:/config/agents.yaml:ro" \
  "$IMAGE"

echo "Logs: docker logs -f $NAME"
docker logs --tail 20 "$NAME" || true
