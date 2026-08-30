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

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/nushell"
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
check_integration mise "$CACHE_DIR/mise.nu" "mise.nu"
check_integration zoxide "$CACHE_DIR/zoxide.nu" "zoxide.nu"
check_integration fzf "$CACHE_DIR/fzf.nu" "fzf.nu"
check_integration atuin "$ATUIN_INIT" "atuin init.nu"

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
        let mise = ($env.MISE_SHELL? | default "not loaded")
        let z = (which z | get -o type | first | default "not loaded")
        let atuin_kb = ($env.config.keybindings | where name == "atuin" | length)
        let fzf_kb = ($env.config.keybindings | where name =~ "fzf" | length)
        let required_aliases = ["ll","cat","grep","v","g","j","m","b","openf"]
        let missing_aliases = ($required_aliases
            | where {|a| which $a | is-empty}
            | str join ",")
        let aliases = ($required_aliases
            | where {|a| not (which $a | is-empty)}
            | str join ",")
        print $"starship: ($starship)
mise: ($mise)
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
        job list | get -o id | each {|id| job kill $id} | ignore
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
