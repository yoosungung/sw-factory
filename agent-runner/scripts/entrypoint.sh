#!/bin/sh
set -eu

if [ "${AGENT_RUNNER_MOCK:-0}" = "1" ]; then
  exec node dist/server.js
fi

# Optional per-agent override (Secret GH_TOKEN_{name}) wins over shared GH_TOKEN.
if [ -n "${GH_TOKEN_OVERRIDE:-}" ]; then
  export GH_TOKEN="$GH_TOKEN_OVERRIDE"
fi

if [ -z "${GH_TOKEN:-}" ]; then
  echo "error: GH_TOKEN is required for bot agent runners (GitHub push/PR)" >&2
  exit 1
fi

# K8s injects GH_TOKEN — gh uses it automatically; login would only print a warning.
gh auth setup-git

if [ -n "${AGENT_EMAIL:-}" ]; then
  git config --global user.email "$AGENT_EMAIL"
  git config --global user.name "${AGENT_NAME:-agent}"
fi

exec node dist/server.js
