#!/usr/bin/env bash
# Generate Nushell integrations in the user cache.
set -euo pipefail

# Nushell uses ~/Library/Caches on macOS and XDG_CACHE_HOME on Unix.
# Ask Nushell for the authoritative path so config.nu and this generator agree.
CACHE_DIR=""
if command -v nu >/dev/null 2>&1; then
    CACHE_DIR=$(nu -n -c "print \$nu.cache-dir" 2>/dev/null || true)
fi
# Native Windows Nushell prints a Windows path. When this script runs under
# Git Bash, convert it before mkdir/mktemp/mv so generated files land in the
# same cache directory that Nushell reads.
if [[ "$CACHE_DIR" =~ ^[A-Za-z]:[\\/] ]] && command -v cygpath >/dev/null 2>&1; then
    CACHE_DIR=$(cygpath -u "$CACHE_DIR")
fi
CACHE_DIR="${CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/nushell}"

# `$nu.cache-dir` is fixed from the environment the process starts with, so the
# answer differs by launch path: a terminal spawned from Finder/Rex (no
# XDG_CACHE_HOME) resolves macOS' platform default ~/Library/Caches/nushell,
# while one spawned from a shell that already carries XDG_CACHE_HOME resolves
# ~/.cache/nushell. config.nu sources $nu.cache-dir/<tool>.nu, so a generator
# that wrote to one of those paths left the other launch path with no
# integrations at all (no prompt, no fzf/atuin keybindings, no zoxide).
# Keep one physical directory and make the platform default a symlink to it.
if [[ "$(uname -s)" == "Darwin" ]]; then
    xdg_cache="${XDG_CACHE_HOME:-$HOME/.cache}/nushell"
    platform_cache="$HOME/Library/Caches/nushell"
    if [[ "$CACHE_DIR" != "$xdg_cache" ]]; then
        echo "Note: Nushell resolved $CACHE_DIR; generating in $xdg_cache instead"
        CACHE_DIR="$xdg_cache"
    fi
    if [[ -L "$platform_cache" ]]; then
        if [[ "$(readlink "$platform_cache")" != "$CACHE_DIR" ]]; then
            ln -sfn "$CACHE_DIR" "$platform_cache"
        fi
    elif [[ -e "$platform_cache" ]]; then
        echo "  ⚠️  $platform_cache is a real directory; leaving it alone."
        echo "      Remove it (or move its files) so it can link to $CACHE_DIR."
    else
        mkdir -p "$(dirname "$platform_cache")"
        ln -s "$CACHE_DIR" "$platform_cache"
    fi
fi
ATUIN_INIT="$CACHE_DIR/atuin.nu"

mkdir -p "$CACHE_DIR" "${ATUIN_INIT%/*}"

# config.nu pins $env.config.history.file to ~/.local/share/nushell so that every
# launch path records into one database (Nushell's default follows the inherited
# $nu.data-dir, which split history in two). Create it before the first session.
mkdir -p "$HOME/.local/share/nushell"

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
    # Some Atuin releases give both Ctrl-R and Up the same `atuin` name,
    # which makes Nushell warn about duplicate keybinding names. Keep the
    # Ctrl-R name used by health checks and give the second binding a unique
    # name without depending on a particular Atuin version.
    if [ "$(grep -c '^            name: atuin$' "$ATUIN_INIT" 2>/dev/null || true)" -gt 1 ]; then
        tmp=$(mktemp "${ATUIN_INIT}.tmp.XXXXXX")
        awk '/^            name: atuin$/ { count++; if (count > 1) sub(/name: atuin$/, "name: atuin_up_arrow") } { print }' \
            "$ATUIN_INIT" > "$tmp" && mv "$tmp" "$ATUIN_INIT"
        echo "Renamed duplicate Atuin keybinding"
    fi
    echo "Generated Atuin integration"
else
    rm -f "$ATUIN_INIT"
fi

if command -v fzf >/dev/null 2>&1; then
    # fzf >= 0.75 emits the record-based completer Nushell 0.116+ expects
    # (`{|place| __fzf_external_completer $place}`). Releases up to 0.74 emitted
    # a legacy positional `{|spans| ...}` wrapper, which Nushell now warns
    # about; if a host is pinned below 0.75, bump fzf rather than patching here.
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
