#!/usr/bin/env bash
# Install the Herdr plugins that config/herdr/config.toml binds keybindings to.
#
# Herdr plugin registrations are per-user state stored by Herdr outside the
# dotfiles config, so keybindings in config.toml silently do nothing until the
# plugins are installed. This script restores them idempotently.
#
# Safe to re-run. Requires the `herdr` binary (Home Manager or Homebrew) — no
# Herdr server needs to be running, but one must exist to query state.
#
# Install: ./scripts/setup-herdr-plugins.sh

set -euo pipefail

# plugin_id<TAB>owner/repo<TAB>immutable Git revision
# Keep these revisions pinned so a fresh machine gets the same plugin set.
PLUGIN_SOURCES="
annotate	plannotator/herdr-annotate	bccf884b874f5f39ccbef1bb6ac67625c5fb5d54
herdr-file-viewer	smarzban/herdr-file-viewer	647f03236d9aa20de0b07c9de0a951e13a1e59bf
jhochenbaum.hunkdiff	jhochenbaum/herdr-hunk-diff	ad6f670b78887cd0becb473fd486945e5255c062
"

info() { echo "  $*"; }
warn() { echo "  ⚠️  $*"; }
step() { echo ""; echo "━━━ $* ━━━"; }

if ! command -v herdr &>/dev/null; then
    warn "herdr not found — install it first (brew install herdr), then re-run this script"
    exit 0
fi

step "Herdr plugins"

missing=0
while IFS=$'\t' read -r id source ref; do
    [ -n "$id" ] || continue
    current_ref="$({
        herdr plugin list --plugin "$id" --json 2>/dev/null || true
    } | grep -o '"resolved_commit":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"

    if [ "$current_ref" = "$ref" ]; then
        info "✔ $id pinned at ${ref:0:12}"
    elif [ -n "$current_ref" ]; then
        warn "$id is at ${current_ref:0:12}, expected ${ref:0:12}"
        warn "Reinstall with: herdr plugin uninstall $id && herdr plugin install $source --ref $ref --yes"
        missing=1
    else
        info "Installing $id from $source at ${ref:0:12}..."
        # --yes: noninteractive (bootstrap context). Plugins run as the user
        # and fetch binaries at install; review manifests before trusting a
        # new source.
        if herdr plugin install "$source" --ref "$ref" --yes; then
            info "✔ $id installed"
        else
            warn "Failed to install $id — run the pinned command above manually"
            missing=1
        fi
    fi
done <<< "$PLUGIN_SOURCES"

if [ "$missing" -eq 1 ]; then
    warn "Some Herdr plugins are missing or drifted — fix them and re-run"
    exit 1
fi

info "All Herdr plugins present."
