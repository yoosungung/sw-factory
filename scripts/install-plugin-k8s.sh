#!/usr/bin/env bash
# Install CursorBridge into the live Leantime Deployment (ConfigMap + writable data emptyDir).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="${ROOT}/leantime-plugin"
NS=leantime
CM=cursorbridge-plugin

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

# Flat keys for ConfigMap (avoid nested path hell)
cp "$PLUGIN"/BridgeConfig.php \
   "$PLUGIN"/Listener.php \
   "$PLUGIN"/Plugin.php \
   "$PLUGIN"/ResilientRunnerClient.php \
   "$PLUGIN"/Router.php \
   "$PLUGIN"/RunnerClient.php \
   "$PLUGIN"/RunnerTransport.php \
   "$PLUGIN"/OpenAIRunnerClient.php \
   "$PLUGIN"/DelegatingRunnerClient.php \
   "$PLUGIN"/RunnerSessionNotFoundException.php \
   "$PLUGIN"/SessionStore.php \
   "$PLUGIN"/ScheduleCron.php \
   "$PLUGIN"/ScheduleTicker.php \
   "$PLUGIN"/ScheduleGates.php \
   "$PLUGIN"/DefaultScheduleGates.php \
   "$PLUGIN"/InProgressTicketProbe.php \
   "$PLUGIN"/NullInProgressTicketProbe.php \
   "$PLUGIN"/LeantimeInProgressTicketProbe.php \
   "$PLUGIN"/TicketLookup.php \
   "$PLUGIN"/NullTicketLookup.php \
   "$PLUGIN"/LeantimeTicketLookup.php \
   "$PLUGIN"/CommentLookup.php \
   "$PLUGIN"/NullCommentLookup.php \
   "$PLUGIN"/LeantimeCommentLookup.php \
   "$PLUGIN"/register.php \
   "$PLUGIN"/composer.json \
   "$PLUGIN"/bridge.json \
   "$tmpdir/"
cp "$PLUGIN"/bin/flush-retries.php "$tmpdir/bin.flush-retries.php"
cp "$PLUGIN"/bin/tick-schedules.php "$tmpdir/bin.tick-schedules.php"
mkdir -p "$tmpdir/Services"
cp "$PLUGIN"/Services/CursorBridge.php "$tmpdir/Services/"

kubectl -n "$NS" create configmap "$CM" \
  --from-file="$tmpdir" \
  --from-file=Services.CursorBridge.php="$tmpdir/Services/CursorBridge.php" \
  --dry-run=client -o yaml | kubectl apply -f -

# Patch deployment volumes (idempotent apply of overlay)
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: cursorbridge-install-script
  namespace: leantime
data:
  install.sh: |
    #!/bin/sh
    set -eu
    DEST=/var/www/html/app/Plugins/CursorBridge
    mkdir -p "$DEST/Services" "$DEST/data"
    SRC=/plugin-src
    for f in BridgeConfig.php Listener.php Plugin.php ResilientRunnerClient.php Router.php \
             RunnerClient.php RunnerTransport.php OpenAIRunnerClient.php DelegatingRunnerClient.php \
             RunnerSessionNotFoundException.php SessionStore.php \
             ScheduleCron.php ScheduleTicker.php ScheduleGates.php DefaultScheduleGates.php \
             InProgressTicketProbe.php NullInProgressTicketProbe.php LeantimeInProgressTicketProbe.php \
             TicketLookup.php NullTicketLookup.php \
             LeantimeTicketLookup.php CommentLookup.php NullCommentLookup.php LeantimeCommentLookup.php \
             register.php composer.json bridge.json; do
      cp "$SRC/$f" "$DEST/$f"
    done
    mkdir -p "$DEST/bin"
    cp "$SRC/bin.flush-retries.php" "$DEST/bin/flush-retries.php"
    cp "$SRC/bin.tick-schedules.php" "$DEST/bin/tick-schedules.php"
    chmod 755 "$DEST/bin/flush-retries.php" "$DEST/bin/tick-schedules.php"
    cp "$SRC/Services.CursorBridge.php" "$DEST/Services/CursorBridge.php"
    chown -R www-data:www-data "$DEST" || true
    echo "CursorBridge installed into $DEST"
EOF

# Add/update volume mounts via strategic merge patch
kubectl -n "$NS" patch deploy leantime --type='json' -p='[
  {"op":"add","path":"/spec/template/spec/volumes/-","value":{"name":"cursorbridge-src","configMap":{"name":"cursorbridge-plugin"}}},
  {"op":"add","path":"/spec/template/spec/volumes/-","value":{"name":"cursorbridge-install","configMap":{"name":"cursorbridge-install-script","defaultMode":493}}},
  {"op":"add","path":"/spec/template/spec/volumes/-","value":{"name":"cursorbridge-data","emptyDir":{}}}
]' 2>/dev/null || true

# Ensure initContainers / volumeMounts exist — fetch current and rewrite carefully
python3 - <<'PY'
import json, subprocess, copy

ns = "leantime"
raw = subprocess.check_output(["kubectl","-n",ns,"get","deploy","leantime","-o","json"])
dep = json.loads(raw)
spec = dep["spec"]["template"]["spec"]
vols = spec.setdefault("volumes", [])

def ensure_vol(name, body):
    for i,v in enumerate(vols):
        if v.get("name")==name:
            vols[i]=body
            return
    vols.append(body)

ensure_vol("cursorbridge-src", {"name":"cursorbridge-src","configMap":{"name":"cursorbridge-plugin"}})
ensure_vol("cursorbridge-install", {"name":"cursorbridge-install","configMap":{"name":"cursorbridge-install-script","defaultMode":0o755}})
ensure_vol("cursorbridge-data", {"name":"cursorbridge-data","emptyDir":{}})

init = {
  "name": "install-cursorbridge",
  "image": "busybox:1.36",
  "command": ["sh","/install/install.sh"],
  "volumeMounts": [
    {"name":"cursorbridge-src","mountPath":"/plugin-src"},
    {"name":"cursorbridge-install","mountPath":"/install"},
    {"name":"cursorbridge-plugin-dir","mountPath":"/var/www/html/app/Plugins/CursorBridge"},
  ],
}
# shared emptyDir for plugin dir between init and container
ensure_vol("cursorbridge-plugin-dir", {"name":"cursorbridge-plugin-dir","emptyDir":{}})
init["volumeMounts"] = [
    {"name":"cursorbridge-src","mountPath":"/plugin-src"},
    {"name":"cursorbridge-install","mountPath":"/install"},
    {"name":"cursorbridge-plugin-dir","mountPath":"/var/www/html/app/Plugins/CursorBridge"},
    {"name":"cursorbridge-data","mountPath":"/var/www/html/app/Plugins/CursorBridge/data"},
]

inits = [i for i in spec.get("initContainers", []) if i.get("name")!="install-cursorbridge"]
inits.insert(0, init)
spec["initContainers"] = inits

# container mounts
c = spec["containers"][0]
mounts = [m for m in c.get("volumeMounts", []) if m.get("name") not in ("cursorbridge-plugin-dir","cursorbridge-data")]
mounts.append({"name":"cursorbridge-plugin-dir","mountPath":"/var/www/html/app/Plugins/CursorBridge"})
mounts.append({"name":"cursorbridge-data","mountPath":"/var/www/html/app/Plugins/CursorBridge/data"})
c["volumeMounts"] = mounts

# Fix install script paths: data needs to exist inside plugin dir emptyDir before copy
# Update ConfigMap install to also mkdir data — already does

subprocess.run(["kubectl","-n",ns,"replace","-f","-"], input=json.dumps(dep).encode(), check=True)
print("Patched deploy/leantime with CursorBridge initContainer + mounts")
PY

echo "Restarting Leantime to run the plugin initContainer..."
kubectl -n "$NS" rollout restart deploy/leantime
echo "Waiting for rollout..."
kubectl -n "$NS" rollout status deploy/leantime --timeout=120s
POD=$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=leantime -o jsonpath='{.items[0].metadata.name}')
kubectl -n "$NS" exec "$POD" -- ls -la /var/www/html/app/Plugins/CursorBridge/
kubectl -n "$NS" exec "$POD" -- head -12 /var/www/html/app/Plugins/CursorBridge/Listener.php
echo "Done. Pod=$POD"
