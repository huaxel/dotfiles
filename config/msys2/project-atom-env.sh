#!/usr/bin/env bash
# Machine-local runtime defaults for Project Atom on Windows/MSYS2.
# Data paths are detected only when the VM's F: layout exists; other machines
# should export ATOM_DATA_ROOT themselves.

path_prepend() {
  [ -d "$1" ] || return 0
  case ":${PATH:-}:" in
    *":$1:"*) ;;
    *) PATH="$1:${PATH:-}" ;;
  esac
}

path_prepend "$HOME/.local/bin"
path_prepend "$HOME/.npm-global/bin"
export PATH

if [ -z "${USERPROFILE:-}" ] && [ -n "${USER:-}" ]; then
  export USERPROFILE="C:\\Users\\${USER}"
fi
export HOMEDRIVE="${HOMEDRIVE:-C:}"
export HOMEPATH="${HOMEPATH:-\\Users\\${USER:-}}"

if [ -d /f/RBNB/tmp ]; then
  export TEMP='F:/RBNB/tmp'
  export TMP='F:/RBNB/tmp'
  export XDG_CACHE_HOME='F:/RBNB/cache'
elif command -v cygpath >/dev/null 2>&1; then
  export TEMP="${TEMP:-$(cygpath -w /tmp)}"
  export TMP="${TMP:-$(cygpath -w /tmp)}"
fi

if [ -d /f/RBNB/prod/atom-data ]; then
  export ATOM_DATA_ROOT='F:/RBNB/prod/atom-data'
  # Keep the configured drive path even when the VPN is temporarily offline.
  export ATOM_SOURCE_ROOT='Z:/'
fi
