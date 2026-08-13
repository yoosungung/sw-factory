#!/usr/bin/env bash
# Pull agent runtime backup (MEMORY.md + mcp.json) from cluster PVC to local
# gitignored *.pulled files for human review. Never git add/commit.
#
# Usage:
#   ./deploy/k8s/scripts/pull-agent-backup.sh
#   ./deploy/k8s/scripts/pull-agent-backup.sh --agent pm
#   ./deploy/k8s/scripts/pull-agent-backup.sh --date 2026-08-13
set -euo pipefail

NS="${CURSORBRIDGE_NS:-sw-factory}"
PVC="agent-runtime-backup"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PERSONAS="$ROOT/deploy/personas"
IMAGE="${AGENT_BACKUP_PULL_IMAGE:-ghcr.io/yoosungung/cursor-agent-runner:latest}"
DATE=""
AGENT_FILTER=""
KEEP_POD=0

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE="${2:?}"; shift 2 ;;
    --agent) AGENT_FILTER="${2:?}"; shift 2 ;;
    --keep-pod) KEEP_POD=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown arg: $1" >&2; usage 1 ;;
  esac
done

need() { command -v "$1" >/dev/null || { echo "need $1" >&2; exit 1; }; }
need kubectl
need tar

if ! kubectl -n "$NS" get pvc "$PVC" >/dev/null 2>&1; then
  echo "PVC $NS/$PVC missing — apply cronjob-agent-restart first" >&2
  exit 1
fi

POD="agent-backup-pull-$(date +%s)"
cleanup() {
  if [[ "$KEEP_POD" -eq 0 ]]; then
    kubectl -n "$NS" delete pod "$POD" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  else
    echo "left pod $NS/$POD (--keep-pod)" >&2
  fi
}
trap cleanup EXIT

echo "starting pull pod $POD (mount $PVC)..."
kubectl -n "$NS" apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $POD
  namespace: $NS
  labels:
    app: cursorbridge
    component: agent-backup-pull
spec:
  restartPolicy: Never
  imagePullSecrets:
    - name: ghcr-pull
  containers:
    - name: pull
      image: $IMAGE
      imagePullPolicy: IfNotPresent
      command: ["sleep", "600"]
      volumeMounts:
        - name: backup
          mountPath: /backup
  volumes:
    - name: backup
      persistentVolumeClaim:
        claimName: $PVC
EOF

kubectl -n "$NS" wait --for=condition=Ready "pod/$POD" --timeout=180s

if [[ -z "$DATE" ]]; then
  DATE="$(kubectl -n "$NS" exec "$POD" -- sh -c \
    'ls -1 /backup 2>/dev/null | grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" | sort | tail -1')"
fi
if [[ -z "$DATE" ]]; then
  echo "no YYYY-MM-DD dirs under /backup yet (run CronJob or dump once)" >&2
  exit 1
fi
echo "using backup day=$DATE"

AGENTS=()
if [[ -n "$AGENT_FILTER" ]]; then
  AGENTS=("$AGENT_FILTER")
else
  while IFS= read -r a; do
    [[ -n "$a" ]] && AGENTS+=("$a")
  done < <(kubectl -n "$NS" exec "$POD" -- sh -c "ls -1 /backup/$DATE 2>/dev/null || true")
fi

if [[ ${#AGENTS[@]} -eq 0 ]]; then
  echo "no agent dirs under /backup/$DATE" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; cleanup' EXIT

for agent in "${AGENTS[@]}"; do
  dest_persona="$PERSONAS/$agent"
  mkdir -p "$dest_persona"
  for f in MEMORY.md mcp.json; do
    remote="/backup/$DATE/$agent/$f"
    if ! kubectl -n "$NS" exec "$POD" -- test -f "$remote"; then
      echo "skip missing $remote" >&2
      continue
    fi
    local_pulled="$dest_persona/${f}.pulled"
    kubectl -n "$NS" exec "$POD" -- cat "$remote" >"$local_pulled"
    echo "wrote $local_pulled"
    # Diff hints (persona paths vary: MEMORY at persona root, mcp under .cursor/)
    case "$f" in
      MEMORY.md)
        for cand in "$dest_persona/MEMORY.md" "$dest_persona/.cursor/MEMORY.md"; do
          if [[ -f "$cand" ]]; then
            echo "  diff hint: diff -u $cand $local_pulled"
            break
          fi
        done
        echo "  promote: cp $local_pulled $dest_persona/MEMORY.md   # then seed: delete pod MEMORY + restart, or kubectl cp"
        ;;
      mcp.json)
        for cand in "$dest_persona/.cursor/mcp.json" "$dest_persona/mcp.json"; do
          if [[ -f "$cand" ]]; then
            echo "  diff hint: diff -u $cand $local_pulled"
            break
          fi
        done
        echo "  promote: merge into persona .cursor/mcp.json → render-agents → apply → restart"
        ;;
    esac
  done
done

echo
echo "done. Review *.pulled (gitignore). Do not git commit secrets/hints blindly."
echo "Restore MEMORY to cluster: delete /cursor-home/.cursor/MEMORY.md in pod then restart (seed), or kubectl cp."
