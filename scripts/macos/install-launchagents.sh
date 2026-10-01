#!/usr/bin/env bash
# Install LaunchAgents for cursor + gateway + git HEAD poller (KeepAlive).
#
#   ./scripts/macos/install-launchagents.sh
#   ./scripts/macos/uninstall-launchagents.sh
#   ./scripts/macos/restart-launchagents.sh
#
# Mutually exclusive with `npm run local:run` (same ports / data-dir).
# HEAD poller: watch-git-head.sh → restart cursor/gateway when `git rev-parse HEAD` changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL_PREFIX="net.askwho.sw-factory"
AGENTS_DIR="${HOME}/Library/LaunchAgents"
TOOLS="${LOCAL_TOOLS_DIR:-$ROOT/.tools}"
LOG_DIR="${LOG_DIR:-$TOOLS/local-logs}"
ENV_FILE="$ROOT/deploy/local/.env"

mkdir -p "$AGENTS_DIR" "$LOG_DIR"

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "node_modules missing — run: npm install" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — cp deploy/env.example deploy/local/.env" >&2
  exit 1
fi

# Prefer stopping native pid stack so 8080 is free.
if [[ -x "$ROOT/scripts/stop-local.sh" ]]; then
  "$ROOT/scripts/stop-local.sh" >/dev/null 2>&1 || true
fi

# Capture a usable PATH for launchd (login shell may differ).
SWF_PATH="$(command -v node >/dev/null && dirname "$(command -v node)")"
SWF_PATH="${SWF_PATH}:$(dirname "$ROOT/node_modules/.bin/tsx")"
SWF_PATH="${SWF_PATH}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:/usr/bin:/bin"

uid="$(id -u)"
domain="gui/${uid}"

write_plist() {
  local name="$1"
  local script="$2"
  local label="${LABEL_PREFIX}.${name}"
  local plist="${AGENTS_DIR}/${label}.plist"
  local out="${LOG_DIR}/${name}.launchd.out.log"
  local err="${LOG_DIR}/${name}.launchd.err.log"

  cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${script}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SWF_LAUNCHD_PATH</key>
    <string>${SWF_PATH}</string>
    <key>SWF_GIT_HEAD_POLL_SEC</key>
    <string>${SWF_GIT_HEAD_POLL_SEC:-60}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${out}</string>
  <key>StandardErrorPath</key>
  <string>${err}</string>
</dict>
</plist>
EOF

  # Reload idempotently.
  launchctl bootout "${domain}/${label}" 2>/dev/null || true
  launchctl bootstrap "$domain" "$plist"
  launchctl enable "${domain}/${label}" 2>/dev/null || true
  launchctl kickstart -k "${domain}/${label}" 2>/dev/null || true
  echo "Installed $label → $plist"
}

chmod +x \
  "$ROOT/scripts/macos/run-cursor.sh" \
  "$ROOT/scripts/macos/run-gateway.sh" \
  "$ROOT/scripts/macos/restart-launchagents.sh" \
  "$ROOT/scripts/macos/watch-git-head.sh" \
  "$ROOT/scripts/macos/install-launchagents.sh" \
  "$ROOT/scripts/macos/uninstall-launchagents.sh"

write_plist cursor "$ROOT/scripts/macos/run-cursor.sh"
# Brief delay so cursor can bind :8080 before gateway catch-up.
sleep 1
write_plist gateway "$ROOT/scripts/macos/run-gateway.sh"
write_plist git-head-watch "$ROOT/scripts/macos/watch-git-head.sh"

echo
echo "LaunchAgents up (KeepAlive + HEAD poll)."
echo "  logs:  $LOG_DIR/*.launchd.*.log"
echo "  HEAD:  poll every \${SWF_GIT_HEAD_POLL_SEC:-60}s → restart cursor/gateway"
echo "  status: launchctl print gui/\$(id -u)/${LABEL_PREFIX}.cursor | head"
echo "  stop:   ./scripts/macos/uninstall-launchagents.sh"
echo "  note:   do not also run npm run local:run"
echo "  cookie: refresh deploy/local/.env then: launchctl kickstart -k gui/\$(id -u)/${LABEL_PREFIX}.gateway"
