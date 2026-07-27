#!/usr/bin/env bash
# M0 spike: agent-runner mock E2E + synthetic run counts
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/agent-runner"

npm ci
export AGENT_RUNNER_MOCK=1
PORT=8765 npm run dev &
PID=$!
trap 'kill $PID' EXIT
sleep 2

for i in 1 2 3; do
  curl -sf -X POST "http://127.0.0.1:8765/sessions" \
    -H 'Content-Type: application/json' \
    -d "{\"prompt\":\"spike ticket $i\",\"ticket_id\":$i}" >/dev/null
done

REPORT=$(curl -sf "http://127.0.0.1:8765/spike/report")
echo "M0 spike report: ${REPORT}"
npm test
