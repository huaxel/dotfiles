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
    # Fix upstream atuin bug (v18.13.0+): `e>|` redirects only stderr into the
    # pipe, so `atuin history start`'s stdout (the history ID) is lost and no
    # commands are recorded / search output is dropped. Replacing `e>|` with `|`
    # restores stdout while `complete`/`str trim` still silence errors.
    # See https://github.com/atuinsh/atuin/issues/3358
    if grep -q 'e>|' "$ATUIN_INIT"; then
        # Portable in-place edit: BSD sed (macOS) requires an argument to -i,
        # GNU sed (Linux) does not. Use a temp file + mv which works on both.
        sed 's/e>|/|/g' "$ATUIN_INIT" > "$ATUIN_INIT.tmp" && mv "$ATUIN_INIT.tmp" "$ATUIN_INIT"
        echo "Applied atuin e>| fix (upstream issue #3358)"
    fi
    echo "Generated Atuin integration"
fi

if command -v fzf >/dev/null 2>&1; then
    fzf --nushell > "$CACHE_DIR/fzf.nu"
    echo "Generated fzf integration"
fi

# Ensure bat indexes custom themes (e.g. ~/.config/bat/themes/*.tmTheme).
# Without the cache, bat warns 'Unknown theme' when the alias uses a theme.
if command -v bat >/dev/null 2>&1; then
    if [ ! -f "${XDG_CACHE_HOME:-$HOME/.cache}/bat/themes.bin" ]; then
        bat cache --build >/dev/null 2>&1 || true
        echo "Built bat theme/syntax cache"
    fi
fi
