#!/usr/bin/env bash
set -euo pipefail

# Set this to the number of stages in your wizard.
TOTAL_STAGES=1
ENV_FILE="${ENV_FILE:-.env}"
CURRENT_STAGE=0

stage() {
  local title=$1
  if [[ -t 1 ]]; then
    clear
  fi
  CURRENT_STAGE=$((CURRENT_STAGE + 1))
  printf '\n[%d/%d] %s\n' "$CURRENT_STAGE" "$TOTAL_STAGES" "$title"
  printf '%s\n' '────────────────────────────────────────'
}

say() {
  printf '%s\n' "$*"
}

step() {
  printf '  • %s\n' "$*"
}

pause() {
  local prompt=${1:-Press Enter when ready}
  read -r -p "$prompt " _
}

confirm() {
  local prompt=${1:-Continue?}
  local answer
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

open_url() {
  local url=$1
  if command -v wslview >/dev/null 2>&1; then
    wslview "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  elif command -v explorer.exe >/dev/null 2>&1; then
    explorer.exe "$url" >/dev/null 2>&1 &
  else
    say "Open this URL in your browser: $url"
  fi
}

ask() {
  local __result=$1 prompt=$2 default=${3:-} answer
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default] " answer
    answer=${answer:-$default}
  else
    read -r -p "$prompt " answer
  fi
  printf -v "$__result" '%s' "$answer"
}

ask_secret() {
  local __result=$1 prompt=$2 answer
  read -r -s -p "$prompt " answer
  printf '\n'
  printf -v "$__result" '%s' "$answer"
}

write_env() {
  local key=$1 value=$2 dir tmp
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Invalid environment variable name: %s\n' "$key" >&2
    return 1
  }
  dir=$(dirname "$ENV_FILE")
  mkdir -p "$dir"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  tmp=$(mktemp "${ENV_FILE}.tmp.XXXXXX")
  WIZARD_ENV_VALUE=$value awk -v key="$key" '
    BEGIN { value = ENVIRON["WIZARD_ENV_VALUE"]; replaced = 0 }
    $0 ~ ("^" key "=") {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "$ENV_FILE" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

set_secret() {
  local name=$1 value=$2
  command -v gh >/dev/null 2>&1 || {
    say "gh is not installed; skipped GitHub secret $name"
    return 0
  }
  printf '%s' "$value" | gh secret set "$name"
}

set_var() {
  local name=$1 value=$2
  command -v gh >/dev/null 2>&1 || {
    say "gh is not installed; skipped GitHub variable $name"
    return 0
  }
  printf '%s' "$value" | gh variable set "$name"
}

finish() {
  local status=$?
  if (( status == 0 )); then
    printf '\nWizard complete. %d/%d stages finished.\n' "$CURRENT_STAGE" "$TOTAL_STAGES"
  else
    printf '\nWizard stopped after stage %d/%d.\n' "$CURRENT_STAGE" "$TOTAL_STAGES" >&2
  fi
  exit "$status"
}
trap finish EXIT

# ── STAGES ──────────────────────────────────────────────────────────────────
# Replace this example with one stage per manual step, then update TOTAL_STAGES.
stage "Example stage"
say "Replace this stage with a focused manual action."
pause
