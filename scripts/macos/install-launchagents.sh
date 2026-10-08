#!/usr/bin/env bash
# Install LaunchAgents for cursor + gateway + git HEAD poller + daily restart.
#
#   ./scripts/macos/install-launchagents.sh
#   ./scripts/macos/uninstall-launchagents.sh
#   ./scripts/macos/restart-launchagents.sh
#
# Mutually exclusive with `npm run local:run` (same ports / data-dir).
# HEAD poller: watch-git-head.sh → restart cursor/gateway when `git rev-parse HEAD` changes.
# Daily: local dawn calendar → restart-launchagents.sh (sticky clear + kickstart).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL_PREFIX="net.askwho.sw-factory"
AGENTS_DIR="${HOME}/Library/LaunchAgents"
TOOLS="${LOCAL_TOOLS_DIR:-$ROOT/.tools}"
LOG_DIR="${LOG_DIR:-$TOOLS/local-logs}"
ENV_FILE="$ROOT/deploy/local/.env"
DAILY_HOUR="${SWF_DAILY_RESTART_HOUR:-4}"
DAILY_MINUTE="${SWF_DAILY_RESTART_MINUTE:-0}"

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

  # Reload idempotently (bootout→bootstrap can race with ThrottleInterval).
  launchctl bootout "${domain}/${label}" 2>/dev/null || true
  sleep 1
  if ! launchctl bootstrap "$domain" "$plist" 2>/dev/null; then
    sleep 2
    launchctl bootstrap "$domain" "$plist" 2>/dev/null || true
  fi
  launchctl enable "${domain}/${label}" 2>/dev/null || true
  launchctl kickstart -k "${domain}/${label}" 2>/dev/null || true
  if ! launchctl print "${domain}/${label}" >/dev/null 2>&1; then
    echo "failed to load $label" >&2
    exit 1
  fi
  echo "Installed $label → $plist"
}

# One-shot calendar job (no KeepAlive / no install-time kickstart).
write_calendar_plist() {
  local name="$1"
  local script="$2"
  local hour="$3"
  local minute="$4"
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
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${out}</string>
  <key>StandardErrorPath</key>
  <string>${err}</string>
</dict>
</plist>
EOF

  launchctl bootout "${domain}/${label}" 2>/dev/null || true
  sleep 1
  if ! launchctl bootstrap "$domain" "$plist" 2>/dev/null; then
    sleep 2
    launchctl bootstrap "$domain" "$plist" 2>/dev/null || true
  fi
  launchctl enable "${domain}/${label}" 2>/dev/null || true
  if ! launchctl print "${domain}/${label}" >/dev/null 2>&1; then
    echo "failed to load $label" >&2
    exit 1
  fi
  echo "Installed $label → $plist (daily ${hour}:$(printf '%02d' "$minute") local)"
}

chmod +x \
  "$ROOT/scripts/macos/run-cursor.sh" \
  "$ROOT/scripts/macos/run-gateway.sh" \
  "$ROOT/scripts/macos/restart-launchagents.sh" \
  "$ROOT/scripts/macos/watch-git-head.sh" \
  "$ROOT/scripts/macos/daily-restart.sh" \
  "$ROOT/scripts/macos/install-launchagents.sh" \
  "$ROOT/scripts/macos/uninstall-launchagents.sh"

write_plist cursor "$ROOT/scripts/macos/run-cursor.sh"
# Brief delay so cursor can bind :8080 before gateway catch-up.
sleep 1
write_plist gateway "$ROOT/scripts/macos/run-gateway.sh"
write_plist git-head-watch "$ROOT/scripts/macos/watch-git-head.sh"
write_calendar_plist daily-restart "$ROOT/scripts/macos/daily-restart.sh" "$DAILY_HOUR" "$DAILY_MINUTE"

echo
echo "LaunchAgents up (KeepAlive + HEAD poll + daily restart)."
echo "  logs:  $LOG_DIR/*.launchd.*.log"
echo "  HEAD:  poll every \${SWF_GIT_HEAD_POLL_SEC:-60}s → restart cursor/gateway"
echo "  daily: ${DAILY_HOUR}:$(printf '%02d' "$DAILY_MINUTE") local → sticky clear + restart"
echo "  status: launchctl print gui/\$(id -u)/${LABEL_PREFIX}.cursor | head"
echo "  stop:   ./scripts/macos/uninstall-launchagents.sh"
echo "  note:   do not also run npm run local:run"
echo "  cookie: refresh deploy/local/.env then: launchctl kickstart -k gui/\$(id -u)/${LABEL_PREFIX}.gateway"
