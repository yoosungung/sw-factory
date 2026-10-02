#!/usr/bin/env bash
# Source me. import_zshrc_env pulls exported vars from an interactive login zsh
# (~/.zshrc and the login files zsh reads with -lic). Aliases and functions
# are not imported. Failure and timeout are non-fatal.
#
# SWF_IMPORT_ZSHRC=0            skip
# SWF_ZSH_BIN                   zsh binary (default /bin/zsh or PATH)
# SWF_ZSHRC_IMPORT_TIMEOUT      seconds (default 20)

import_zshrc_env() {
  if [[ "${SWF_IMPORT_ZSHRC:-1}" == "0" ]]; then
    return 0
  fi

  local zdot="${ZDOTDIR:-$HOME}"
  local zshrc="${zdot}/.zshrc"
  if [[ ! -f "$zshrc" ]]; then
    return 0
  fi

  local zsh_bin="${SWF_ZSH_BIN:-}"
  if [[ -z "$zsh_bin" ]]; then
    if [[ -x /bin/zsh ]]; then
      zsh_bin=/bin/zsh
    elif command -v zsh >/dev/null 2>&1; then
      zsh_bin="$(command -v zsh)"
    else
      echo "import-zshrc: zsh not found; continuing without ${zshrc}" >&2
      return 0
    fi
  fi

  local perl_bin="/usr/bin/perl"
  if [[ ! -x "$perl_bin" ]]; then
    echo "import-zshrc: ${perl_bin} missing; continuing without ${zshrc}" >&2
    return 0
  fi

  local here dump timeout
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  dump="$(mktemp)"
  timeout="${SWF_ZSHRC_IMPORT_TIMEOUT:-20}"

  # -lic: login + interactive, so ~/.zshrc runs. The dump is a file inside
  # the child so banners on stdout are not part of the environment.
  # Child stderr goes to a file too: a hung grandchild must not keep the
  # caller's stderr pipe open. Its own process group is killed on timeout.
  if [[ ! "$timeout" =~ ^[0-9]+$ ]] || [[ "$timeout" -lt 1 ]]; then
    timeout=20
  fi
  local err timeout_flag done_flag pid timer status monitor
  err="$(mktemp)"
  timeout_flag="$(mktemp)"
  done_flag="$(mktemp)"
  rm -f "$timeout_flag" "$done_flag"
  pid=""
  timer=""
  status=0
  monitor=0
  case $- in
    *m*) monitor=1 ;;
  esac
  set +o notify
  set -m || true
  SWF_ZSH_ENV_DUMP="$dump" \
    SWF_PERL_DUMP="$here/dump-env.pl" \
    "$zsh_bin" -lic '/usr/bin/perl "$SWF_PERL_DUMP" "$SWF_ZSH_ENV_DUMP"' \
    </dev/null >/dev/null 2>"$err" &
  pid=$!
  (
    sleep "$timeout"
    [[ -f "$done_flag" ]] && exit 0
    echo 1 >"$timeout_flag"
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  ) >/dev/null 2>&1 &
  timer=$!
  if [[ "$monitor" -eq 0 ]]; then
    set +m
  fi

  wait "$pid" || status=$?
  echo 1 >"$done_flag"
  kill -TERM -- "-$timer" 2>/dev/null || kill -TERM "$timer" 2>/dev/null || true
  wait "$timer" 2>/dev/null || true
  local timed_out=0
  [[ -f "$timeout_flag" ]] && timed_out=1
  if [[ -s "$err" ]]; then
    cat "$err" >&2
  fi
  rm -f "$err" "$timeout_flag" "$done_flag"

  if [[ "$timed_out" -eq 1 ]]; then
    echo "import-zshrc: timed out after ${timeout}s; continuing without ${zshrc}" >&2
    rm -f "$dump"
    return 0
  fi
  if [[ "$status" -ne 0 ]]; then
    echo "import-zshrc: zsh -lic failed; continuing without ${zshrc}" >&2
    rm -f "$dump"
    return 0
  fi

  if [[ ! -s "$dump" ]]; then
    rm -f "$dump"
    return 0
  fi

  local line key val
  while IFS= read -r -d '' line || [[ -n "${line:-}" ]]; do
    key="${line%%=*}"
    val="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    case "$key" in
      PWD | OLDPWD | SHLVL | _ | SWF_ZSH_ENV_DUMP | SWF_PERL_DUMP) continue ;;
    esac
    export "$key=$val"
  done <"$dump"
  rm -f "$dump"
}
