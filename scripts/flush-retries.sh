#!/usr/bin/env bash
# Flush CursorBridge retry queue (local dev or Leantime pod path).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "${ROOT}/leantime-plugin/bin/flush-retries.php" ]]; then
  PLUGIN_ROOT="${ROOT}/leantime-plugin"
  if [[ -f "${PLUGIN_ROOT}/vendor/autoload.php" ]]; then
    php "${PLUGIN_ROOT}/bin/flush-retries.php"
    exit 0
  fi
fi

cd "${ROOT}/leantime-plugin"
php -r '
require "vendor/autoload.php";
$plugin = Leantime\Plugins\CursorBridge\Plugin::createDefault();
echo "flushed=" . $plugin->flushRetries() . PHP_EOL;
'
