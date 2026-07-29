#!/usr/bin/env bash
# One-shot install for NS=sw-factory (factory staff stack).
# Prerequisites: Leantime Helm release + secrets (cursor-api-key, ghcr-pull) already in NS.
# Does NOT create "My Project". Deletes any existing project named My Project during seed.
#
# Usage:
#   ./scripts/install-sw-factory.sh              # seed + render + apply + plugin
#   ./scripts/install-sw-factory.sh --wipe       # delete factory agent resources first, then install
#   CURSORBRIDGE_NS=sw-factory ./scripts/install-sw-factory.sh --wipe
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS="${CURSORBRIDGE_NS:-sw-factory}"
WIPE=0
SKIP_SEED=0

if [[ -x "${ROOT}/.venv/bin/python" ]]; then
  PYTHON="${ROOT}/.venv/bin/python"
elif [[ -x "${ROOT}/.venv/bin/python3" ]]; then
  PYTHON="${ROOT}/.venv/bin/python3"
else
  PYTHON="${PYTHON:-python3}"
fi

for arg in "$@"; do
  case "$arg" in
    --wipe) WIPE=1 ;;
    --skip-seed) SKIP_SEED=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

cd "$ROOT"

if [[ ! -f deploy/k8s/agents.yaml ]]; then
  ./scripts/bootstrap-config.sh
fi

# Ensure NS settings for sw-factory render
"$PYTHON" - <<'PY' "$ROOT/deploy/k8s/agents.yaml" "$NS"
import sys
from pathlib import Path
import yaml
path = Path(sys.argv[1])
ns = sys.argv[2]
data = yaml.safe_load(path.read_text()) or {}
settings = dict(data.get("settings") or {})
settings["k8s_namespace"] = ns
settings.setdefault("leantime_url", f"http://leantime.{ns}.svc")
data["settings"] = settings
path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))
print(f"settings.k8s_namespace={ns} leantime_url={settings['leantime_url']}")
PY

wipe_factory() {
  echo "==> wipe factory resources in ns=$NS (keep Leantime Helm + secrets)"
  # Old rename leftovers + current staff
  local names=(candy finder infra pm km ta qa aa asky path seewin)
  local n
  for n in "${names[@]}"; do
    kubectl -n "$NS" delete statefulset "cursor-agent-${n}" --ignore-not-found --wait=false || true
    kubectl -n "$NS" delete service "cursor-agent-${n}" --ignore-not-found || true
    kubectl -n "$NS" delete configmap "persona-${n}" --ignore-not-found || true
    kubectl -n "$NS" delete pvc "cursor-home-cursor-agent-${n}-0" --ignore-not-found || true
  done
  kubectl -n "$NS" delete service cursor-agents --ignore-not-found || true
  kubectl -n "$NS" delete cronjob \
    cursorbridge-flush-retries \
    cursorbridge-schedule-tick \
    cursorbridge-pvc-retention \
    cursorbridge-spend-alert \
    candydate-pass-ab-launch \
    candydate-pass-ab-monitor \
    candydate-pass-d \
    --ignore-not-found || true
  kubectl -n "$NS" delete configmap cursorbridge-ops-scripts --ignore-not-found || true
  # Wait for STS pods to terminate
  kubectl -n "$NS" wait --for=delete pod -l app=cursor-agent --timeout=180s 2>/dev/null || true
  echo "wipe done"
}

if [[ "$WIPE" -eq 1 ]]; then
  wipe_factory
fi

echo "==> wait for Leantime"
kubectl -n "$NS" rollout status deploy/leantime --timeout=180s
kubectl -n "$NS" wait --for=condition=Ready pod -l app.kubernetes.io/name=mariadb --timeout=180s 2>/dev/null \
  || kubectl -n "$NS" wait --for=condition=Ready pod leantime-mariadb-0 --timeout=180s

if [[ "$SKIP_SEED" -eq 0 ]]; then
  echo "==> seed factory users + PATs (no My Project)"
  CURSORBRIDGE_NS="$NS" "$PYTHON" deploy/k8s/scripts/seed_factory_users.py
fi

echo "==> Dual-loop To-Do Status on all clients[].project_id"
CURSORBRIDGE_NS="$NS" "$PYTHON" deploy/k8s/scripts/status_board.py --all-clients || true

echo "==> sync bridge.json + render agents"
"$PYTHON" deploy/k8s/scripts/sync-bridge-json.py
RENDER_BIN="$(mktemp -d)"
cat >"$RENDER_BIN/python3" <<EOF
#!/bin/sh
exec "$PYTHON" "\$@"
EOF
chmod +x "$RENDER_BIN/python3"
cp "$RENDER_BIN/python3" "$RENDER_BIN/python"
PATH="$RENDER_BIN:$PATH" ./deploy/k8s/scripts/render-agents.sh
rm -rf "$RENDER_BIN"

echo "==> apply overlay"
kubectl apply -k deploy/k8s/overlays/sw-factory

echo "==> install + enable CursorBridge plugin"
CURSORBRIDGE_NS="$NS" ./scripts/install-plugin-k8s.sh
POD="$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=leantime -o jsonpath='{.items[0].metadata.name}')"
# Composer package name (folder is CursorBridge). Confirm prompts with yes.
printf 'yes\nyes\n' | kubectl -n "$NS" exec -i "$POD" -c leantime -- \
  php bin/leantime plugin:install "didim/cursor-bridge" || true
printf 'yes\n' | kubectl -n "$NS" exec -i "$POD" -c leantime -- \
  php bin/leantime plugin:enable "didim/cursor-bridge" || true
# Idempotent DB enable (CLI prompts are flaky under kubectl exec)
DB_PW="$(kubectl -n "$NS" get secret leantime-mariadb -o jsonpath='{.data.mariadb-password}' | base64 -d)"
kubectl -n "$NS" exec leantime-mariadb-0 -c mariadb -- \
  mariadb -uleantime -p"$DB_PW" leantime -e \
  "DELETE FROM zp_plugins WHERE foldername='CursorBridge' AND id NOT IN (
     SELECT id FROM (SELECT MAX(id) AS id FROM zp_plugins WHERE foldername='CursorBridge') t);
   UPDATE zp_plugins SET enabled=1 WHERE foldername='CursorBridge';" || true

echo "==> wait for staff agent pods"
for n in pm km ta qa aa; do
  kubectl -n "$NS" rollout status "statefulset/cursor-agent-${n}" --timeout=300s
done

echo "==> smoke"
POD="$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=leantime -o jsonpath='{.items[0].metadata.name}')"
kubectl -n "$NS" get pods,sts,cronjob,ing
kubectl -n "$NS" exec "$POD" -c leantime -- php bin/leantime plugin:list | head -40
DB_PW="$(kubectl -n "$NS" get secret leantime-mariadb -o jsonpath='{.data.mariadb-password}' | base64 -d)"
kubectl -n "$NS" exec leantime-mariadb-0 -c mariadb -- \
  mariadb -uleantime -p"$DB_PW" leantime -e \
  "SELECT id,username,firstname,role FROM zp_user; SELECT id,name,clientId FROM zp_projects; SELECT id,name,enabled,foldername FROM zp_plugins;"

echo "OK: ns=$NS install complete. UI: https://sw-factory.k8s-test"
