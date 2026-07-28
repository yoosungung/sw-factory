#!/bin/sh
# Seed persona ConfigMap files into cursor-home PVC.
# MEMORY.md: copy only if missing (preserve runtime edits across redeploy).
# All other persona files: always overwrite from ConfigMap.
set -eu
PERSONA_SRC="${PERSONA_SRC:-/persona}"
CURSOR_HOME="${CURSOR_HOME:-/cursor-home}"

for src in "$PERSONA_SRC"/*; do
  [ -f "$src" ] || continue
  key=$(basename "$src")
  dest="$key"
  case "$key" in
    *__*)
      dest=$(echo "$key" | sed 's/__/\//g' | sed 's/^_dot_/./')
      ;;
  esac
  mkdir -p "$CURSOR_HOME/$(dirname "$dest")"
  case "$dest" in
    .cursor/MEMORY.md)
      if [ ! -f "$CURSOR_HOME/$dest" ]; then
        cp "$src" "$CURSOR_HOME/$dest"
      fi
      ;;
    *)
      cp "$src" "$CURSOR_HOME/$dest"
      ;;
  esac
done
