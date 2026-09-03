#!/usr/bin/env bash
# Install the Herdr plugins that config/herdr/config.toml binds keybindings to.
#
# Herdr plugin registrations are per-user state stored by Herdr outside the
# dotfiles config, so keybindings in config.toml silently do nothing until the
# plugins are installed. This script restores them idempotently.
#
# Safe to re-run. Requires the `herdr` binary (Brewfile) — no Herdr server
# needs to be running, but one must exist to query state.
#
# Install: ./scripts/setup-herdr-plugins.sh

set -euo pipefail

# plugin_id<TAB>owner/repo install source
PLUGIN_SOURCES="
annotate	plannotator/herdr-annotate
cloudmanic.herdr-plus	cloudmanic/herdr-plus
herdr-file-viewer	smarzban/herdr-file-viewer
jhochenbaum.hunkdiff	jhochenbaum/herdr-hunk-diff
rohanthewiz.herdr-todo	rohanthewiz/herdr-todo
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
while IFS=$'\t' read -r id source; do
    [ -n "$id" ] || continue
    if herdr plugin list --json 2>/dev/null | grep -q "\"plugin_id\":\"$id\""; then
        info "✔ $id already installed"
    else
        info "Installing $id from $source..."
        # --yes: noninteractive (bootstrap context). Plugins run as the user
        # and fetch binaries at install; review manifests before trusting a
        # new source. Pin --ref if you want a specific revision.
        if herdr plugin install "$source" --yes; then
            info "✔ $id installed"
        else
            warn "Failed to install $id — run manually: herdr plugin install $source"
            missing=1
        fi
    fi
done <<< "$PLUGIN_SOURCES"

if [ "$missing" -eq 1 ]; then
    warn "Some Herdr plugins failed to install — re-run this script after fixing"
    exit 1
fi

info "All Herdr plugins present."
