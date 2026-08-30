#!/usr/bin/env bash
# Generate Nushell integrations in the user cache.
set -euo pipefail

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/nushell"
ATUIN_INIT="$CACHE_DIR/atuin.nu"

mkdir -p "$CACHE_DIR" "${ATUIN_INIT%/*}"

# Write beside the destination and rename only after generation succeeds. This
# keeps a running shell usable if a tool upgrade leaves a broken executable.
generate_integration() {
    local output="$1"
    shift
    local tmp
    tmp=$(mktemp "${output}.tmp.XXXXXX")
    if "$@" > "$tmp"; then
        mv "$tmp" "$output"
    else
        rm -f "$tmp"
        return 1
    fi
}

if command -v starship >/dev/null 2>&1; then
    generate_integration "$CACHE_DIR/starship.nu" starship init nu
    echo "Generated Starship integration"
else
    rm -f "$CACHE_DIR/starship.nu"
fi

if command -v mise >/dev/null 2>&1; then
    generate_integration "$CACHE_DIR/mise.nu" mise activate nu
    echo "Generated mise integration"
else
    rm -f "$CACHE_DIR/mise.nu"
fi

if command -v zoxide >/dev/null 2>&1; then
    generate_integration "$CACHE_DIR/zoxide.nu" zoxide init nushell
    echo "Generated zoxide integration"
else
    rm -f "$CACHE_DIR/zoxide.nu"
fi

if command -v atuin >/dev/null 2>&1; then
    generate_integration "$ATUIN_INIT" atuin init nu
    # Fix upstream atuin bug (v18.13.0+): `e>|` redirects only stderr into the
    # pipe, so `atuin history start`'s stdout (the history ID) is lost and no
    # commands are recorded / search output is dropped. Replacing `e>|` with `|`
    # restores stdout while `complete`/`str trim` still silence errors.
    # See https://github.com/atuinsh/atuin/issues/3358
    if grep -q 'e>|' "$ATUIN_INIT"; then
        tmp=$(mktemp "${ATUIN_INIT}.tmp.XXXXXX")
        sed 's/e>|/|/g' "$ATUIN_INIT" > "$tmp" && mv "$tmp" "$ATUIN_INIT"
        echo "Applied atuin e>| fix (upstream issue #3358)"
    fi
    echo "Generated Atuin integration"
else
    rm -f "$ATUIN_INIT"
fi

if command -v fzf >/dev/null 2>&1; then
    generate_integration "$CACHE_DIR/fzf.nu" fzf --nushell
    echo "Generated fzf integration"
else
    rm -f "$CACHE_DIR/fzf.nu"
fi

# Ensure bat indexes custom themes (e.g. ~/.config/bat/themes/*.tmTheme).
# Without the cache, bat warns 'Unknown theme' when the alias uses a theme.
if command -v bat >/dev/null 2>&1; then
    if [ ! -f "${XDG_CACHE_HOME:-$HOME/.cache}/bat/themes.bin" ]; then
        bat cache --build >/dev/null 2>&1 || true
        echo "Built bat theme/syntax cache"
    fi
fi
