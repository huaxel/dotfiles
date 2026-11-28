#!/usr/bin/env bash
# shellcheck disable=SC2016
# Nushell setup health check: config, integrations, keybindings, aliases.
# Run after tool upgrades or on a new machine.
set -euo pipefail

echo "=== Nushell Health ==="
if ! command -v nu &>/dev/null; then
    echo "  ⚠️  nu not installed — install via pacman/brew/scoop first"
    exit 1
fi

errors=0

# Match Nushell’s platform-specific cache directory (Library/Caches on macOS).
CACHE_DIR=""
if command -v nu >/dev/null 2>&1; then
    CACHE_DIR=$(nu -n -c 'print $nu.cache-dir' 2>/dev/null || true)
fi
CACHE_DIR="${CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/nushell}"
ATUIN_INIT="$CACHE_DIR/atuin.nu"

# 1. Config parses
if nu --config config/nushell/config.nu --env-config config/nushell/env.nu -c 'print "ok"' >/dev/null 2>&1; then
    echo "  ✅ config parses"
else
    echo "  ❌ config parse failed"
    errors=$((errors + 1))
fi

# 2. Generated integrations are required only when their tools are installed.
# setup-nushell removes stale files when a tool is uninstalled.
check_integration() {
    local tool="$1"
    local output="$2"
    local label="$3"
    if command -v "$tool" >/dev/null 2>&1; then
        if [ -f "$output" ]; then
            echo "  ✅ $label present"
        else
            echo "  ❌ $label missing — run: just nushell-setup"
            errors=$((errors + 1))
        fi
    elif [ -f "$output" ]; then
        echo "  ❌ $label is stale — run: just nushell-setup"
        errors=$((errors + 1))
    else
        echo "  ↪ $label skipped ($tool not installed)"
    fi
}

check_integration starship "$CACHE_DIR/starship.nu" "starship.nu"
check_integration zoxide "$CACHE_DIR/zoxide.nu" "zoxide.nu"
check_integration fzf "$CACHE_DIR/fzf.nu" "fzf.nu"
check_integration atuin "$ATUIN_INIT" "atuin init.nu"

# 2b. Every launch path must reach those files. `$nu.cache-dir` above is the one
# this process resolved; a shell started by Finder/Rex resolves the platform
# default instead, so integration generation counts as healthy only when both
# paths are the same physical directory (setup-nushell.sh links them).
if [ "$(uname -s)" = "Darwin" ]; then
    xdg_dir="${XDG_CACHE_HOME:-$HOME/.cache}/nushell"
    platform_dir="$HOME/Library/Caches/nushell"
    xdg_real=$(cd "$xdg_dir" 2>/dev/null && pwd -P || true)
    platform_real=$(cd "$platform_dir" 2>/dev/null && pwd -P || true)
    if [ -z "$xdg_real" ] || [ -z "$platform_real" ]; then
        echo "  ❌ integration cache missing (${xdg_real:-$xdg_dir} / ${platform_real:-$platform_dir})"
        echo "     a shell started without XDG_CACHE_HOME would lose every integration"
        echo "     run: just nushell-setup"
        errors=$((errors + 1))
    elif [ "$xdg_real" != "$platform_real" ]; then
        echo "  ❌ launch paths resolve different cache dirs"
        echo "     XDG:      $xdg_real"
        echo "     platform: $platform_real"
        echo "     run: just nushell-setup"
        errors=$((errors + 1))
    else
        echo "  ✅ one integration cache for every launch path ($platform_real)"
    fi
fi

# 3. Load the checked-out config, not merely the deployed config. macOS does
# not ship GNU timeout, so use it when available and otherwise run directly.
run_nu() {
    if command -v timeout >/dev/null 2>&1; then
        timeout 20 nu "$@"
    else
        nu "$@"
    fi
}

health_output=""
if health_output=$(run_nu --no-history \
    --config config/nushell/config.nu \
    --env-config config/nushell/env.nu \
    -e '
        let starship = ($env.STARSHIP_SHELL? | default "not loaded")
        let z = (which z | get -o type | first | default "not loaded")
        let atuin_kb = ($env.config.keybindings | where name == "atuin" | length)
        let fzf_kb = ($env.config.keybindings | where name =~ "fzf" | length)
        let required_aliases = ["ll","cat","grep","v","g","j","b","openf"]
        let missing_aliases = ($required_aliases
            | where {|a| which $a | is-empty}
            | str join ",")
        let aliases = ($required_aliases
            | where {|a| not (which $a | is-empty)}
            | str join ",")
        print $"starship: ($starship)
z: ($z)
atuin_kb: ($atuin_kb)
fzf_kb: ($fzf_kb)
missing_aliases: ($missing_aliases)
aliases: ($aliases)"
        if (which atuin | is-not-empty) and $atuin_kb == 0 {
            error make {msg: "Atuin is installed but its keybinding is missing"}
        }
        if (which fzf | is-not-empty) and $fzf_kb == 0 {
            error make {msg: "fzf is installed but its keybindings are missing"}
        }
        if ($missing_aliases | is-not-empty) {
            error make {msg: $"Missing aliases: ($missing_aliases)"}
        }
        # Atuin starts asynchronous index preparation during initialization;
        # terminate it in this short-lived health process before exiting.
        # Best-effort: a job that already finished cannot be killed, and a
        # failed kill used to abort the block before `exit`, which then left
        # Nushell falling back to a REPL with a non-TTY stdin.
        try { job list | get -o id | each {|id| job kill $id} | ignore } catch { null }
        exit
    ' 2>&1); then
    printf '%s\n' "$health_output" | sed 's/^/  /'
else
    echo "  ❌ interactive load failed"
    printf '%s\n' "$health_output" | sed 's/^/    /' | head -8
    errors=$((errors + 1))
fi

if [ "$errors" -gt 0 ]; then
    echo "  ❌ $errors Nushell health issue(s) — run: just nushell-setup"
    exit 1
fi
echo "  ✅ Nushell setup healthy"
