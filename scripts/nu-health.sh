#!/usr/bin/env bash
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
ATUIN_INIT="${XDG_DATA_HOME:-$HOME/.local/share}/atuin/init.nu"

# 1. Config parses
if nu --config config/nushell/config.nu --env-config config/nushell/env.nu -c 'print "ok"' >/dev/null 2>&1; then
    echo "  ✅ config parses"
else
    echo "  ❌ config parse failed"
    errors=$((errors + 1))
fi

# 2. Integration files exist (regenerate with just nushell-setup)
for f in "$CACHE_DIR/starship.nu" \
         "$CACHE_DIR/mise.nu" \
         "$CACHE_DIR/zoxide.nu" \
         "$CACHE_DIR/fzf.nu" \
         "$ATUIN_INIT"; do
    if [ -f "$f" ]; then
        echo "  ✅ $(basename "$f") present"
    else
        echo "  ⚠️  $(basename "$f") missing — run: just nushell-setup"
        errors=$((errors + 1))
    fi
done

# 3. Interactive load with keybindings/aliases
if timeout 20 nu -e "
    let out = \$\"starship: (\$env.STARSHIP_SHELL)
mise: (\$env | get -o MISE_SHELL | default \"none\")
z: ((which z | get type | get 0))
atuin_kb: (\$env.config.keybindings | where name == \"atuin\" | length)
fzf_kb: (\$env.config.keybindings | where name =~ \"fzf\" | length)
aliases: ([\"ll\",\"cat\",\"grep\",\"v\",\"g\",\"j\",\"m\",\"b\",\"openf\"] | where {|a| not (which \$a | is-empty)} | str join \",\")
\"
    \$out | save -f /tmp/nu-health.txt
    exit" >/dev/null 2>&1; then
    sed 's/^/  /' /tmp/nu-health.txt
else
    echo "  ❌ interactive load failed"
    errors=$((errors + 1))
fi

if [ "$errors" -gt 0 ]; then
    echo "  ❌ $errors Nushell health issue(s) — run: just nushell-setup"
    exit 1
fi
echo "  ✅ Nushell setup healthy"
