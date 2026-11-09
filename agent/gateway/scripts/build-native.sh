#!/usr/bin/env bash
# Compile agent/gateway to a single bun executable (no Node runtime at run).
# Usage (from repo root or any cwd):
#   ./agent/gateway/scripts/build-native.sh [outfile]
# Env:
#   BUN_BIN                 bun binary (default: bun on PATH or ~/.bun/bin/bun)
#   GATEWAY_COMPILE_TARGET  bun --target (e.g. bun-linux-x64); empty = host
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-$ROOT/agent/gateway/dist/sw-factory-gateway}"
ENTRY="$ROOT/agent/gateway/src/cli.ts"

if [[ -n "${BUN_BIN:-}" ]]; then
  BUN="$BUN_BIN"
elif command -v bun >/dev/null 2>&1; then
  BUN="$(command -v bun)"
elif [[ -x "${HOME:-}/.bun/bin/bun" ]]; then
  BUN="$HOME/.bun/bin/bun"
else
  echo "bun not found — install https://bun.sh (or set BUN_BIN)" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
args=(build --compile "$ENTRY" --outfile "$OUT")
if [[ -n "${GATEWAY_COMPILE_TARGET:-}" ]]; then
  args+=(--target="$GATEWAY_COMPILE_TARGET")
fi

echo "Building gateway native: bun ${args[*]}"
"$BUN" "${args[@]}"
chmod +x "$OUT"
echo "OK $OUT"
