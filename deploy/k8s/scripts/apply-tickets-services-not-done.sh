#!/usr/bin/env bash
# Build Tickets.Services.php overlay (status not_done default) and apply to leantime-app-patch CM + mount.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export NS="${CURSORBRIDGE_NS:-sw-factory}"
SCRIPTS="$ROOT/deploy/k8s/scripts"
OUT="${1:-$ROOT/deploy/k8s/leantime-app-patch/Tickets.Services.php}"

POD=$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=leantime -o jsonpath='{.items[0].metadata.name}')
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

# Prefer image file (not the overlay mount). Injector is idempotent if already patched.
kubectl -n "$NS" exec "$POD" -c leantime -- \
  cat /var/www/html/app/Domain/Tickets/Services/Tickets.php > "$tmpdir/Tickets.php"

python3 - <<PY
from pathlib import Path
import sys
sys.path.insert(0, "$SCRIPTS")
import tickets_services_not_done as td
src = Path("$tmpdir/Tickets.php").read_text()
Path("$OUT").write_text(td.inject_not_done_default(src))
print("wrote", "$OUT", "bytes", Path("$OUT").stat().st_size)
PY

kubectl -n "$NS" create configmap leantime-app-patch \
  --from-file=Tickets.Services.php="$OUT" \
  --dry-run=client -o json > "$tmpdir/cm-fragment.json"

python3 - <<PY
import json, os, subprocess
ns = os.environ["NS"]
fragment = json.load(open("$tmpdir/cm-fragment.json"))
new_data = fragment.get("data") or {}
cm = json.loads(subprocess.check_output(["kubectl", "-n", ns, "get", "cm", "leantime-app-patch", "-o", "json"]))
cm.setdefault("data", {}).update(new_data)
# apply's last-applied-configuration annotation blows the 256KiB limit on large PHP overlays.
ann = cm.setdefault("metadata", {}).setdefault("annotations", {})
ann.pop("kubectl.kubernetes.io/last-applied-configuration", None)
cm.get("metadata", {}).pop("managedFields", None)
subprocess.run(["kubectl", "-n", ns, "replace", "-f", "-"], input=json.dumps(cm).encode(), check=True)
print("ConfigMap leantime-app-patch updated with Tickets.Services.php")
PY

python3 - <<'PY'
import json, os, subprocess
ns = os.environ["NS"]
dep = json.loads(subprocess.check_output(["kubectl", "-n", ns, "get", "deploy", "leantime", "-o", "json"]))
c = dep["spec"]["template"]["spec"]["containers"][0]
mounts = c.setdefault("volumeMounts", [])
path = "/var/www/html/app/Domain/Tickets/Services/Tickets.php"
mounts[:] = [m for m in mounts if m.get("mountPath") != path]
mounts.append({
    "name": "app-patch",
    "mountPath": path,
    "subPath": "Tickets.Services.php",
    "readOnly": True,
})
subprocess.run(["kubectl", "-n", ns, "replace", "-f", "-"], input=json.dumps(dep).encode(), check=True)
print("deploy/leantime mount added for Tickets.Services.php")
PY

kubectl -n "$NS" rollout restart deploy/leantime
kubectl -n "$NS" rollout status deploy/leantime --timeout=180s
POD=$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=leantime -o jsonpath='{.items[0].metadata.name}')
kubectl -n "$NS" exec "$POD" -c leantime -- \
  grep -n "Factory default: open To-Dos only" /var/www/html/app/Domain/Tickets/Services/Tickets.php
echo "Done. Pod=$POD NS=$NS"
