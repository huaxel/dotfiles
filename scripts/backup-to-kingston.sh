#!/usr/bin/env bash
# Backup machine state to KingstonPhotos volume.
# Run on the OLD machine before wiping it.
#
# Usage: ./scripts/backup-to-kingston.sh
#
# Creates /Volumes/KingstonPhotos/backup-<hostname>-<date>/

set -euo pipefail

VOL="/Volumes/KingstonPhotos"
DATE=$(date +%Y%m%d-%H%M)
HOST=$(hostname -s 2>/dev/null || echo "mac")
# Write under projects/ because volume root is root-owned
DEST="$VOL/projects/backup-$HOST-$DATE"

info()  { echo "  $*"; }
ok()    { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
backup() { cp -R "$1" "$DEST/$2" 2>/dev/null && ok "$3" || warn "Failed: $3"; }
backup_dir() { mkdir -p "$(dirname "$DEST/$2")" && rsync -a "$1"/ "$DEST/$2"/ 2>/dev/null && ok "$3" || warn "Failed: $3"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  💾  Backup to KingstonPhotos"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Destination: $DEST"
echo ""

# Check volume
if [ ! -d "$VOL" ]; then
    echo "  ❌ KingstonPhotos not mounted at $VOL"
    exit 1
fi

mkdir -p "$DEST"

# ── 1. Core keys ──────────────────────────────────────
echo "━━━ 1/5 — Core keys ──────────────────────────────"
backup_dir ~/.config/sops/age keys "Age key"
backup_dir ~/.ssh ssh "SSH keys"
backup_dir ~/.gnupg gnupg "GPG keys"

# ── 2. Coding agents ──────────────────────────────────
echo "━━━ 2/5 — Coding agents ──────────────────────────"
backup_dir ~/.claude claude "Claude CLI"
backup_dir ~/.codex codex "Codex CLI"
backup_dir ~/".config/github-copilot" github-copilot "GitHub Copilot"
backup_dir ~/.gemini gemini "Gemini CLI"
backup_dir ~/.wakatime wakatime "WakaTime"
backup_dir ~/.cursor cursor "Cursor"
backup_dir ~/.copilot copilot-hooks "Copilot hooks"
backup_dir ~/.config/opencode opencode "OpenCode"
backup_dir ~/.config/devin devin "Devin"
backup_dir ~/.orca orca "Orca"
backup_dir ~/.kimi-code kimi-code "Kimi Code"
backup_dir ~/.jules jules "Jules"
backup_dir ~/.grok grok "Grok"
backup_dir ~/".config/herdr" herdr "Herdr"
backup_dir ~/".config/mise" mise "Mise config"

# Claude Desktop (large — ~8 GB)
if [ -d ~/"Library/Application Support/Claude" ]; then
    echo "  📦 Claude Desktop data (~8 GB)..."
    rsync -a --info=progress2 ~/"Library/Application Support/Claude"/ "$DEST/claude-desktop"/ 2>/dev/null && ok "Claude Desktop" || warn "Claude Desktop backup skipped"
fi

# CodexBar
backup_dir ~/".local/bin/opencodebar" opencodebar "OpenCodeBar"
[ -d ~/"Library/Application Support/CodexBar" ] && backup_dir ~/"Library/Application Support/CodexBar" codexbar "CodexBar"

# ── 3. App data ───────────────────────────────────────
echo "━━━ 3/5 — App data ───────────────────────────────"
backup_dir ~/"Library/Application Support/Alfred" alfred "Alfred (workflows, license, snippets)"
[ -f ~/Library/Preferences/com.mowglii.ItsycalApp.plist ] && backup ~/Library/Preferences/com.mowglii.ItsycalApp.plist itsycal.plist "Itsycal preferences"
backup_dir ~/"Library/Application Support/LogiOptionsPlus" logioptionsplus "Logi Options+ config"
ls ~/Library/Preferences/com.displaylink.*.plist 2>/dev/null | while read -r f; do
    backup "$f" displaylink-preferences/ "$(basename "$f")"
done

# ── 4. Shell history ──────────────────────────────────
echo "━━━ 4/5 — Shell history ──────────────────────────"
backup_dir ~/.local/share/atuin atuin "Atuin history"
backup_dir ~/.local/share/fish fish "Fish history"

# ── 5. Projects (code repos) ──────────────────────────
echo "━━━ 5/5 — Projects ───────────────────────────────"
for dir in ~/projects/*/ ~/coding/projects/*/; do
    [ -d "$dir/.git" ] || continue
    name=$(basename "$dir")
    backup_dir "$dir" "projects/$name" "projects/$name"
done

# ── Done ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Backup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  On the new machine, run:"
echo "    ~/dotfiles/scripts/restore-from-kingston.sh"
echo ""
echo "  (Or copy manually from $DEST)"
echo ""
