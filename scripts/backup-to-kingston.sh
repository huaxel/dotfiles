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
backup() { cp -R "$1" "$DEST/$2" 2>/dev/null && ok "$3" || warn "Failed: $3"; true; }
backup_dir() {
  mkdir -p "$(dirname "$DEST/$2")" 2>/dev/null
  if rsync -a --ignore-errors "$1"/ "$DEST/$2"/ 2>/dev/null; then
    ok "$3"
  else
    rc=$?
    if [ "$rc" -eq 23 ] || [ "$rc" -eq 24 ]; then
      ok "$3"
    else
      warn "Failed: $3"
    fi
  fi
  true
}

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
echo "━━━ 1/6 — Core keys ──────────────────────────────"
backup_dir ~/.config/sops/age keys "Age key"
backup_dir ~/.ssh ssh "SSH keys"
backup_dir ~/.gnupg gnupg "GPG keys"

# ── 2. Coding agents ──────────────────────────────────
echo "━━━ 2/6 — Coding agents ──────────────────────────"
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
    if rsync -a --info=progress2 ~/"Library/Application Support/Claude"/ "$DEST/claude-desktop"/ 2>/dev/null; then
      ok "Claude Desktop"
    else
      rc=$?
      if [ "$rc" -eq 23 ] || [ "$rc" -eq 24 ]; then
        ok "Claude Desktop (partial — cache files changed during backup)"
      else
        warn "Claude Desktop backup skipped"
      fi
    fi
fi

# OpenCodeBar (single binary) + CodexBar
if [ -f ~/.local/bin/opencodebar ]; then
    mkdir -p "$DEST/opencodebar" 2>/dev/null
    cp ~/.local/bin/opencodebar "$DEST/opencodebar/opencodebar" 2>/dev/null && ok "OpenCodeBar" || warn "Failed: OpenCodeBar"
elif [ -d ~/.local/bin/opencodebar ]; then
    backup_dir ~/.local/bin/opencodebar opencodebar "OpenCodeBar"
fi
[ -d ~/"Library/Application Support/CodexBar" ] && backup_dir ~/"Library/Application Support/CodexBar" codexbar "CodexBar"

# ── 3. App data ───────────────────────────────────────
echo "━━━ 3/6 — App data ───────────────────────────────"
backup_dir ~/"Library/Application Support/Alfred" alfred "Alfred (workflows, license, snippets)"
[ -f ~/Library/Preferences/com.mowglii.ItsycalApp.plist ] && backup ~/Library/Preferences/com.mowglii.ItsycalApp.plist itsycal.plist "Itsycal preferences"
backup_dir ~/"Library/Application Support/LogiOptionsPlus" logioptionsplus "Logi Options+ config"
for f in ~/Library/Preferences/com.displaylink.*.plist; do
    [ -f "$f" ] || continue
    backup "$f" displaylink-preferences/ "$(basename "$f")"
done

# ── 4. Shell history ──────────────────────────────────
echo "━━━ 4/6 — Shell history ──────────────────────────"
backup_dir ~/.local/share/atuin atuin "Atuin history"
backup_dir ~/.local/share/fish fish "Fish history"

# ── 5. Projects (code repos) ──────────────────────────
echo "━━━ 5/6 — Projects ───────────────────────────────"
for dir in ~/projects/*/ ~/coding/projects/*/; do
    [ -d "$dir/.git" ] || continue
    name=$(basename "$dir")
    backup_dir "$dir" "projects/$name" "projects/$name"
done

# ── 6. Browser + game data ──────────────────────────
echo "━━━ 6/6 — Browser + game data ───────────────────"

# Zen browser profile (main release profile)
ZEN_PROFILE="$HOME/Library/Application Support/zen/Profiles/kmcqtbgb.Default (release)"
if [ -d "$ZEN_PROFILE" ]; then
    # Back up essential profile data (skip cache/temp)
    ZEN_DEST="$DEST/zen-profile"
    mkdir -p "$ZEN_DEST" 2>/dev/null
    rsync -a --info=progress2 \
        --exclude='/storage/' \
        --exclude='/cache/' \
        --exclude='/Cache/' \
        --exclude='/startupCache/' \
        --exclude='/cache2/' \
        --exclude='*.sqlite-wal' \
        --exclude='*.sqlite-shm' \
        "$ZEN_PROFILE"/ "$ZEN_DEST"/ 2>/dev/null; rc=$?
    if [ "$rc" -eq 0 ] || [ "$rc" -eq 23 ] || [ "$rc" -eq 24 ]; then
        ok "Zen browser profile (bookmarks, logins, extensions)"
    else
        warn "Zen browser backup failed"
    fi
fi

# Minecraft worlds + config
MC_DIR="$HOME/Library/Application Support/minecraft"
if [ -d "$MC_DIR/saves" ]; then
    MC_DEST="$DEST/minecraft"
    mkdir -p "$MC_DEST" 2>/dev/null
    rsync -a "$MC_DIR/saves"/ "$MC_DEST/saves"/ 2>/dev/null; rc1=$?
    [ "$rc1" -eq 0 ] || [ "$rc1" -eq 23 ] || [ "$rc1" -eq 24 ] && ok "Minecraft worlds ($(du -sh "$MC_DIR/saves" | cut -f1))" || warn "Minecraft worlds backup had issues"
    
    for cfg in launcher_accounts.json launcher_profiles.json options.txt servers.dat; do
        [ -f "$MC_DIR/$cfg" ] && cp -n "$MC_DIR/$cfg" "$MC_DEST/$cfg" 2>/dev/null
    done
    ok "Minecraft config files"
fi

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
