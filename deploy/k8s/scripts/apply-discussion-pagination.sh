#!/usr/bin/env bash
# Apply Discussion pagination overlays (recent N + Load more) to leantime-app-patch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export NS="${CURSORBRIDGE_NS:-sw-factory}"
PATCH="$ROOT/deploy/k8s/leantime-app-patch"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

need=(
  Comments.Repositories.php
  Comments.Services.php
  ShowTicket.php
  generalComment.blade.php
  commentItems.blade.php
  commentPage.blade.php
  Comments.Hxcontrollers.Thread.php
)
for f in "${need[@]}"; do
  test -f "$PATCH/$f" || { echo "missing $PATCH/$f" >&2; exit 1; }
done

kubectl -n "$NS" create configmap leantime-app-patch \
  --from-file=Comments.Repositories.php="$PATCH/Comments.Repositories.php" \
  --from-file=Comments.Services.php="$PATCH/Comments.Services.php" \
  --from-file=ShowTicket.php="$PATCH/ShowTicket.php" \
  --from-file=generalComment.blade.php="$PATCH/generalComment.blade.php" \
  --from-file=commentItems.blade.php="$PATCH/commentItems.blade.php" \
  --from-file=commentPage.blade.php="$PATCH/commentPage.blade.php" \
  --from-file=Comments.Hxcontrollers.Thread.php="$PATCH/Comments.Hxcontrollers.Thread.php" \
  --dry-run=client -o json > "$tmpdir/cm-fragment.json"

python3 - <<PY
import json, os, subprocess
ns = os.environ["NS"]
fragment = json.load(open("$tmpdir/cm-fragment.json"))
new_data = fragment.get("data") or {}
cm = json.loads(subprocess.check_output(["kubectl", "-n", ns, "get", "cm", "leantime-app-patch", "-o", "json"]))
cm.setdefault("data", {}).update(new_data)
ann = cm.setdefault("metadata", {}).setdefault("annotations", {})
ann.pop("kubectl.kubernetes.io/last-applied-configuration", None)
cm.get("metadata", {}).pop("managedFields", None)
subprocess.run(["kubectl", "-n", ns, "replace", "-f", "-"], input=json.dumps(cm).encode(), check=True)
print("ConfigMap leantime-app-patch updated with Discussion pagination keys:", sorted(new_data))
PY

python3 - <<'PY'
import json, os, subprocess
ns = os.environ["NS"]
dep = json.loads(subprocess.check_output(["kubectl", "-n", ns, "get", "deploy", "leantime", "-o", "json"]))
c = dep["spec"]["template"]["spec"]["containers"][0]
mounts = c.setdefault("volumeMounts", [])
wanted = [
    ("/var/www/html/app/Domain/Comments/Repositories/Comments.php", "Comments.Repositories.php"),
    ("/var/www/html/app/Domain/Comments/Services/Comments.php", "Comments.Services.php"),
    ("/var/www/html/app/Domain/Tickets/Controllers/ShowTicket.php", "ShowTicket.php"),
    ("/var/www/html/app/Domain/Comments/Templates/submodules/generalComment.blade.php", "generalComment.blade.php"),
    ("/var/www/html/app/Domain/Comments/Templates/partials/commentItems.blade.php", "commentItems.blade.php"),
    ("/var/www/html/app/Domain/Comments/Templates/partials/commentPage.blade.php", "commentPage.blade.php"),
    ("/var/www/html/app/Domain/Comments/Hxcontrollers/Thread.php", "Comments.Hxcontrollers.Thread.php"),
]
paths = {p for p, _ in wanted}
mounts[:] = [m for m in mounts if m.get("mountPath") not in paths]
for path, sub in wanted:
    mounts.append({"name": "app-patch", "mountPath": path, "subPath": sub, "readOnly": True})
# ensure volume exists
vols = dep["spec"]["template"]["spec"].setdefault("volumes", [])
if not any(v.get("name") == "app-patch" for v in vols):
    vols.append({"name": "app-patch", "configMap": {"name": "leantime-app-patch", "defaultMode": 420}})
subprocess.run(["kubectl", "-n", ns, "replace", "-f", "-"], input=json.dumps(dep).encode(), check=True)
print("deploy/leantime mounts updated for Discussion pagination")
PY

kubectl -n "$NS" rollout restart deploy/leantime
kubectl -n "$NS" rollout status deploy/leantime --timeout=180s
POD=$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=leantime -o jsonpath='{.items[0].metadata.name}')
kubectl -n "$NS" exec "$POD" -c leantime -- grep -n "Factory overlay: Discussion\|Load older comments\|intersect once\|function more" \
  /var/www/html/app/Domain/Tickets/Controllers/ShowTicket.php \
  /var/www/html/app/Domain/Comments/Templates/submodules/generalComment.blade.php \
  /var/www/html/app/Domain/Comments/Templates/partials/commentItems.blade.php \
  /var/www/html/app/Domain/Comments/Hxcontrollers/Thread.php | head -40
echo "Done. Pod=$POD NS=$NS"
