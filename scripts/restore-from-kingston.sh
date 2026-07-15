#!/usr/bin/env bash
# Restore machine state from KingstonPhotos volume.
# Run on the NEW machine after plugging in KingstonPhotos.
#
# Usage: ./scripts/restore-from-kingston.sh
#
# Looks for KingstonPhotos at /Volumes/KingstonPhotos and copies everything
# into place. Safe to re-run — skips existing files with --ignore-existing.

set -euo pipefail

VOL="/Volumes/KingstonPhotos"

# Find backup data — supports both old and new layouts
# New:  /Volumes/KingstonPhotos/projects/backup-<host>-<date>/
# Old:  /Volumes/KingstonPhotos/projects/agent-state/  + root-level files
if ls "$VOL/projects/backup-"* >/dev/null 2>&1; then
    # New timestamped backup dir — use the latest one
    BACKUP=$(ls -dt "$VOL/projects/backup-"* 2>/dev/null | head -1)
    echo "  📂 Using backup: $(basename "$BACKUP")"
    KEYS="$BACKUP/keys"
    AGENTS="$BACKUP"
    APP_DATA="$BACKUP"
    HISTORY="$BACKUP"
    PROJECTS_SRC="$BACKUP/projects"
elif [ -d "$VOL/projects/agent-state" ]; then
    # Old flat layout
    echo "  📂 Using old layout (projects/agent-state + root)"
    KEYS="$VOL/sops"
    AGENTS="$VOL/projects/agent-state"
    APP_DATA="$VOL/projects/agent-state"
    HISTORY="$VOL"
    PROJECTS_SRC="$VOL/projects"
    # Old layout has .claude .codex at root
    OLD_ROOT="$VOL"
else
    echo "  ❌ No backup found on $VOL"
    echo "     Expected: $VOL/projects/backup-*/ or $VOL/projects/agent-state/"
    exit 1
fi

info()  { echo "  $*"; }
ok()    { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
skip()  { echo "  ➖ $* (already exists)"; }
restore_dir() { [ -d "$1" ] && rsync -a --ignore-existing "$1"/ "$2"/ 2>/dev/null && ok "$3" || [ -d "$1" ] && warn "Failed: $3"; }
restore_file() { [ -f "$1" ] && cp -n "$1" "$2" 2>/dev/null && ok "$3" || [ -f "$1" ] && warn "Failed: $3"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄  Restore from KingstonPhotos"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─────────────────────────────────────────────────────
# 1. Core keys (needed before bootstrap)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 1/6 — Core keys ━━━"

if [ -f "$KEYS/keys.txt" ]; then
    mkdir -p ~/.config/sops/age
    restore_file "$KEYS/keys.txt" ~/.config/sops/age/keys.txt "Age key"
    chmod 600 ~/.config/sops/age/keys.txt 2>/dev/null || true
fi

# Also try old layout
if [ -f "$VOL/sops/age/keys.txt" ]; then
    mkdir -p ~/.config/sops/age
    restore_file "$VOL/sops/age/keys.txt" ~/.config/sops/age/keys.txt "Age key (old layout)"
    chmod 600 ~/.config/sops/age/keys.txt 2>/dev/null || true
fi

for src in "$BACKUP/ssh" "$VOL/ssh"; do
    if [ -d "$src" ]; then
        mkdir -p ~/.ssh
        restore_dir "$src" ~/.ssh "SSH keys"
        chmod 600 ~/.ssh/id_* 2>/dev/null || true
        chmod 644 ~/.ssh/*.pub 2>/dev/null || true
        break
    fi
done

for src in "$BACKUP/gnupg" "$VOL/.gnupg"; do
    if [ -d "$src" ]; then
        restore_dir "$src" ~/.gnupg "GPG keys"
        chmod 700 ~/.gnupg 2>/dev/null || true
        chmod 600 ~/.gnupg/* 2>/dev/null || true
        break
    fi
done

# ─────────────────────────────────────────────────────
# 2. Coding agent state
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 2/6 — Coding agents ━━━"

# New layout: flat names; Old layout: dot-prefixed or in agent-state/
for src in "$BACKUP/claude" "$VOL/.claude"; do [ -d "$src" ] && restore_dir "$src" ~/.claude "Claude CLI" && break; done
for src in "$BACKUP/codex" "$VOL/.codex"; do [ -d "$src" ] && restore_dir "$src" ~/.codex "Codex CLI" && break; done
for src in "$BACKUP/gemini" "$AGENTS/.gemini"; do [ -d "$src" ] && restore_dir "$src" ~/.gemini "Gemini CLI" && break; done
for src in "$BACKUP/wakatime" "$AGENTS/.wakatime"; do [ -d "$src" ] && restore_dir "$src" ~/.wakatime "WakaTime" && break; done
for src in "$BACKUP/cursor" "$AGENTS/.cursor"; do [ -d "$src" ] && restore_dir "$src" ~/.cursor "Cursor" && break; done
for src in "$BACKUP/copilot-hooks" "$AGENTS/.copilot"; do [ -d "$src" ] && restore_dir "$src" ~/.copilot "Copilot hooks" && break; done
for src in "$BACKUP/opencode" "$AGENTS/opencode"; do [ -d "$src" ] && restore_dir "$src" ~/.config/opencode "OpenCode" && break; done
for src in "$BACKUP/github-copilot" "$AGENTS/github-copilot"; do [ -d "$src" ] && restore_dir "$src" ~/.config/github-copilot "GitHub Copilot" && break; done
for src in "$BACKUP/devin" "$AGENTS/devin"; do [ -d "$src" ] && restore_dir "$src" ~/.config/devin "Devin" && break; done
for src in "$BACKUP/orca" "$AGENTS/.orca"; do [ -d "$src" ] && restore_dir "$src" ~/.orca "Orca" && break; done
for src in "$BACKUP/kimi-code" "$AGENTS/.kimi-code"; do [ -d "$src" ] && restore_dir "$src" ~/.kimi-code "Kimi Code" && break; done
for src in "$BACKUP/jules" "$AGENTS/.jules"; do [ -d "$src" ] && restore_dir "$src" ~/.jules "Jules" && break; done
for src in "$BACKUP/grok" "$AGENTS/.grok"; do [ -d "$src" ] && restore_dir "$src" ~/.grok "Grok" && break; done
for src in "$BACKUP/codexbar" "$AGENTS/CodexBar"; do [ -d "$src" ] && restore_dir "$src" ~/"Library/Application Support/CodexBar" "CodexBar" && break; done

# Claude Desktop (large)
for src in "$BACKUP/claude-desktop" "$AGENTS/ClaudeAppData"; do
    if [ -d "$src" ]; then
        restore_dir "$src" ~/"Library/Application Support/Claude" "Claude Desktop data"
        break
    fi
done

# ─────────────────────────────────────────────────────
# 3. App data (Alfred, Itsycal, Logi Options+)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 3/6 — App data ━━━"

for src in "$BACKUP/alfred" "$AGENTS/Alfred"; do
    [ -d "$src" ] && restore_dir "$src" ~/"Library/Application Support/Alfred" "Alfred (workflows, license)" && break
done

for src in "$APP_DATA/itsycal.plist" "$AGENTS/com.mowglii.ItsycalApp.plist"; do
    [ -f "$src" ] && restore_file "$src" ~/Library/Preferences/com.mowglii.ItsycalApp.plist "Itsycal preferences" && break
done

for src in "$BACKUP/logioptionsplus" "$AGENTS/LogiOptionsPlus"; do
    [ -d "$src" ] && restore_dir "$src" ~/"Library/Application Support/LogiOptionsPlus" "Logi Options+ config" && break
done

# ─────────────────────────────────────────────────────
# 4. Shell history
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 4/6 — Shell history ━━━"

for src in "$BACKUP/atuin" "$VOL/atuin"; do [ -d "$src" ] && restore_dir "$src" ~/.local/share/atuin "Atuin history" && break; done
for src in "$BACKUP/fish" "$VOL/fish"; do [ -d "$src" ] && restore_dir "$src" ~/.local/share/fish "Fish history" && break; done

# ─────────────────────────────────────────────────────
# 5. Projects (code repos)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 5/6 — Projects ━━━"

if [ -d "$PROJECTS_SRC" ]; then
    for dir in "$PROJECTS_SRC"/*/; do
        name=$(basename "$dir")
        [ "$name" = "agent-state" ] && continue
        [ "$name" = "backup-"* ] && continue
        [ "$name" = ".DS_Store" ] && continue
        target="$HOME/projects/$name"
        if [ -d "$target" ]; then
            skip "projects/$name"
        else
            mkdir -p "$(dirname "$target")" 2>/dev/null || true
            restore_dir "$dir" "$target" "projects/$name"
        fi
    done
fi

# ─────────────────────────────────────────────────────
# 6. Herdr + Mise configs
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 6/6 — Config extras ━━━"

for src in "$BACKUP/herdr" "$AGENTS/herdr"; do [ -d "$src" ] && restore_dir "$src" ~/.config/herdr "Herdr config" && break; done
for src in "$BACKUP/mise" "$AGENTS/mise"; do [ -d "$src" ] && restore_dir "$src" ~/.config/mise "Mise config" && break; done

# ─────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Restore complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo "    1. If age key was restored, run ./bootstrap.sh"
echo "    2. Otherwise restore keys manually first"
echo "    3. Restart Alfred/Itsycal to pick up prefs"
echo ""
