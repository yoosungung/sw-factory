#!/usr/bin/env bash
# Source me. load_launch_env [env_file]
# 1. import ~/.zshrc exports (non-fatal)
# 2. source env_file with allexport so factory keys win
# 3. prefix PATH with the LaunchAgent node/toolchain path

load_launch_env() {
  local env_file="${1:-}"
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck disable=SC1091
  source "$dir/import-zshrc-env.sh"
  import_zshrc_env
  if [[ -n "$env_file" && -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
  export PATH="${SWF_LAUNCHD_PATH:-/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:/usr/bin:/bin}:${PATH:-}"
}
