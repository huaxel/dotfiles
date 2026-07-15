#!/usr/bin/env bash
# Restore machine state from KingstonPhotos volume.
# Run on the NEW machine after plugging in KingstonPhotos.
#
# Usage: ./scripts/restore-from-kingston.sh
#
# Looks for KingstonPhotos at /Volumes/KingstonPhotos and copies everything
# into place. Safe to re-run — skips existing files with -n.

set -euo pipefail

VOL="/Volumes/KingstonPhotos"
SRC="$VOL/projects"

info()  { echo "  $*"; }
ok()    { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
skip()  { echo "  ➖ $* (already exists)"; }
copy()  { cp -Rn "$1" "$2" 2>/dev/null && ok "$3" || warn "Failed to copy $3"; }
copy_all() { rsync -a --ignore-existing "$1"/ "$2"/ 2>/dev/null && ok "$3" || warn "Failed to copy $3"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄  Restore from KingstonPhotos"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─────────────────────────────────────────────────────
# Check volume is mounted
# ─────────────────────────────────────────────────────
if [ ! -d "$VOL" ]; then
    echo "  ❌ KingstonPhotos not found at $VOL"
    echo "     Plug in the drive and try again."
    exit 1
fi
ok "KingstonPhotos mounted at $VOL"

# ─────────────────────────────────────────────────────
# 1. Core keys (needed before bootstrap)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 1/6 — Core keys ━━━"

if [ -f "$VOL/sops/age/keys.txt" ]; then
    mkdir -p ~/.config/sops/age
    copy "$VOL/sops/age/keys.txt" ~/.config/sops/age/keys.txt "Age key"
    chmod 600 ~/.config/sops/age/keys.txt 2>/dev/null || true
fi

if [ -d "$VOL/ssh" ]; then
    mkdir -p ~/.ssh
    copy_all "$VOL/ssh" ~/.ssh "SSH keys"
    chmod 600 ~/.ssh/id_* 2>/dev/null || true
    chmod 644 ~/.ssh/*.pub 2>/dev/null || true
fi

if [ -d "$VOL/.gnupg" ]; then
    copy_all "$VOL/.gnupg" ~/.gnupg "GPG keys"
    chmod 700 ~/.gnupg 2>/dev/null || true
    chmod 600 ~/.gnupg/* 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────
# 2. Coding agent state (claude, codex)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 2/6 — Coding agents ━━━"

[ -d "$VOL/.claude" ]     && copy_all "$VOL/.claude" ~/.claude "Claude CLI state"
[ -d "$VOL/.codex" ]      && copy_all "$VOL/.codex" ~/.codex "Codex CLI state"
[ -d "$SRC/agent-state/ClaudeAppData" ] && copy_all "$SRC/agent-state/ClaudeAppData" \
    ~/"Library/Application Support/Claude" "Claude Desktop data"
[ -d "$SRC/agent-state/.gemini" ]  && copy_all "$SRC/agent-state/.gemini" ~/.gemini "Gemini CLI"
[ -d "$SRC/agent-state/.wakatime" ] && copy_all "$SRC/agent-state/.wakatime" ~/.wakatime "WakaTime"
[ -d "$SRC/agent-state/.cursor" ]  && copy_all "$SRC/agent-state/.cursor" ~/.cursor "Cursor"
[ -d "$SRC/agent-state/.copilot" ] && copy_all "$SRC/agent-state/.copilot" ~/.copilot "Copilot"
[ -d "$SRC/agent-state/opencode" ] && copy_all "$SRC/agent-state/opencode" ~/.config/opencode "OpenCode"
[ -d "$SRC/agent-state/github-copilot" ] && copy_all "$SRC/agent-state/github-copilot" ~/.config/github-copilot "GitHub Copilot config"
[ -d "$SRC/agent-state/devin" ]    && copy_all "$SRC/agent-state/devin" ~/.config/devin "Devin"
[ -d "$SRC/agent-state/.orca" ]    && copy_all "$SRC/agent-state/.orca" ~/.orca "Orca"
[ -d "$SRC/agent-state/.kimi-code" ] && copy_all "$SRC/agent-state/.kimi-code" ~/.kimi-code "Kimi Code"
[ -d "$SRC/agent-state/.jules" ]   && copy_all "$SRC/agent-state/.jules" ~/.jules "Jules"
[ -d "$SRC/agent-state/.grok" ]    && copy_all "$SRC/agent-state/.grok" ~/.grok "Grok"
[ -d "$SRC/agent-state/CodexBar" ] && copy_all "$SRC/agent-state/CodexBar" \
    ~/"Library/Application Support/CodexBar" "CodexBar"

# ─────────────────────────────────────────────────────
# 3. App data (Alfred, Itsycal, Logi Options+)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 3/6 — App data ━━━"

[ -d "$SRC/agent-state/Alfred" ] && copy_all "$SRC/agent-state/Alfred" \
    ~/"Library/Application Support/Alfred" "Alfred (workflows, license, snippets)"

[ -f "$SRC/agent-state/com.mowglii.ItsycalApp.plist" ] && copy \
    "$SRC/agent-state/com.mowglii.ItsycalApp.plist" \
    ~/Library/Preferences/com.mowglii.ItsycalApp.plist "Itsycal preferences"

[ -d "$SRC/agent-state/LogiOptionsPlus" ] && copy_all "$SRC/agent-state/LogiOptionsPlus" \
    ~/"Library/Application Support/LogiOptionsPlus" "Logi Options+ config"

# ─────────────────────────────────────────────────────
# 4. Shell history
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 4/6 — Shell history ━━━"

[ -d "$VOL/atuin" ] && copy_all "$VOL/atuin" ~/.local/share/atuin "Atuin history"
[ -d "$VOL/fish" ]  && copy_all "$VOL/fish" ~/.local/share/fish "Fish history"

# ─────────────────────────────────────────────────────
# 5. Projects (code repos)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 5/6 — Projects ━━━"

if [ -d "$SRC" ]; then
    for dir in "$SRC"/*/; do
        name=$(basename "$dir")
        [ "$name" = "agent-state" ] && continue
        [ "$name" = ".DS_Store" ] && continue
        target="$HOME/projects/$name"
        if [ -d "$target" ]; then
            skip "projects/$name"
        else
            mkdir -p "$(dirname "$target")"
            copy_all "$dir" "$target" "projects/$name"
        fi
    done
fi

# ─────────────────────────────────────────────────────
# 6. Dotfiles repo (cloned via bootstrap, but just in case)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 6/6 — Dotfiles ━━━"

if [ -d "$VOL/dotfiles" ] && [ ! -d "$HOME/dotfiles" ]; then
    copy_all "$VOL/dotfiles" ~/dotfiles "Dotfiles repo (backup)"
fi

# ─────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Restore complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  What to do next:"
echo "    1. If keys were copied above, run ./bootstrap.sh"
echo "    2. Otherwise, restore keys manually first, then bootstrap"
echo "    3. Some apps (Alfred, Itsycal) may need a restart to pick up prefs"
echo ""
