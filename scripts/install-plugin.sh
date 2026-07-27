#!/usr/bin/env bash
# Copy CursorBridge plugin into a Leantime tree.
set -euo pipefail
DEST="${1:?usage: install-plugin.sh /path/to/leantime}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${DEST}/app/Plugins/CursorBridge"
mkdir -p "${TARGET}"
rsync -a --delete \
  --exclude vendor \
  --exclude 'data/*.sqlite' \
  "${ROOT}/leantime-plugin/" "${TARGET}/"
echo "Installed -> ${TARGET}"
echo "Next: composer install in Leantime, enable CursorBridge in My Apps."
