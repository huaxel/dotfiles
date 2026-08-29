#!/usr/bin/env bash
# Generate Nushell integrations in the user cache.
set -euo pipefail

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/nushell"
ATUIN_INIT="${XDG_DATA_HOME:-$HOME/.local/share}/atuin/init.nu"

mkdir -p "$CACHE_DIR" "${ATUIN_INIT%/*}"

if command -v starship >/dev/null 2>&1; then
    starship init nu > "$CACHE_DIR/starship.nu"
    echo "Generated Starship integration"
fi

if command -v mise >/dev/null 2>&1; then
    mise activate nu > "$CACHE_DIR/mise.nu"
    echo "Generated mise integration"
fi

if command -v zoxide >/dev/null 2>&1; then
    zoxide init nushell > "$CACHE_DIR/zoxide.nu"
    echo "Generated zoxide integration"
fi

if command -v atuin >/dev/null 2>&1; then
    atuin init nu > "$ATUIN_INIT"
    echo "Generated Atuin integration"
fi

if command -v fzf >/dev/null 2>&1; then
    fzf --nushell > "$CACHE_DIR/fzf.nu"
    echo "Generated fzf integration"
fi
