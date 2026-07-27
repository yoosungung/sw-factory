#!/usr/bin/env bash
# Bootstrap gitignored local config from committed *.sample files.
# Usage:
#   ./scripts/bootstrap-config.sh          # copy only if target missing
#   ./scripts/bootstrap-config.sh --force  # overwrite targets (CI)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

copy_sample() {
  local sample="$1"
  local target="$2"
  if [[ ! -f "${sample}" ]]; then
    echo "error: missing sample ${sample}" >&2
    exit 1
  fi
  if [[ -f "${target}" && "${FORCE}" -eq 0 ]]; then
    echo "skip (exists): ${target#"${ROOT}/"}"
    return 0
  fi
  mkdir -p "$(dirname "${target}")"
  cp "${sample}" "${target}"
  echo "wrote ${target#"${ROOT}/"}"
}

copy_sample \
  "${ROOT}/deploy/k8s/agents.yaml.sample" \
  "${ROOT}/deploy/k8s/agents.yaml"

copy_sample \
  "${ROOT}/leantime-plugin/bridge.json.sample" \
  "${ROOT}/leantime-plugin/bridge.json"

while IFS= read -r -d '' sample; do
  target="${sample%.sample}"
  copy_sample "${sample}" "${target}"
done < <(find "${ROOT}/deploy/personas" -name 'MEMORY.md.sample' -print0)

echo "done. Edit agents.yaml / MEMORY.md with real identities, then:"
echo "  python deploy/k8s/scripts/sync-bridge-json.py"
