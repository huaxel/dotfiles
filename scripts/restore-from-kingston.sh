#!/usr/bin/env bash
# Restore machine state from KingstonPhotos volume.
# Run on the NEW machine after plugging in KingstonPhotos.
#
# Usage: ./scripts/restore-from-kingston.sh
#
# Looks for KingstonPhotos at /Volumes/KingstonPhotos and copies everything
# into place. Authoritative: overwrites app-created defaults. Intended as a
# one-shot restore on a fresh machine — re-running after you've made new local
# changes will clobber them. Preference plists also flush cfprefsd.

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
# Restore a directory tree, overwriting existing files (backup is authoritative
# on a fresh machine). Idempotent re-runs will clobber local changes — intended
# only as a one-shot restore right after a wipe/new machine.
restore_dir() {
    [ -d "$1" ] || return 0
    mkdir -p "$2" 2>/dev/null || true
    if rsync -a "$1"/ "$2"/ 2>/dev/null; then
        ok "$3"
    else
        warn "Failed: $3"
    fi
}
# Restore a single file, overwriting any existing dest.
restore_file() {
    [ -f "$1" ] || return 0
    mkdir -p "$(dirname "$2")" 2>/dev/null || true
    if cp -f "$1" "$2" 2>/dev/null; then
        ok "$3"
    else
        warn "Failed: $3"
    fi
}
# Restore a ~/Library/Preferences/*.plist. macOS caches these in cfprefsd,
# which will write its in-memory copy back to disk and clobber ours. So: quit
# the app, force-copy, then flush cfprefsd so the next launch reads from disk.
restore_pref() {
    [ -f "$1" ] || return 0
    local app="$4"
    mkdir -p "$(dirname "$2")" 2>/dev/null || true
    killall "$app" 2>/dev/null || true
    if cp -f "$1" "$2" 2>/dev/null; then
        # Prime the cache from disk, then kill the daemon so it re-reads.
        defaults read "$(basename "$2" .plist)" >/dev/null 2>&1 || true
        killall cfprefsd 2>/dev/null || true
        ok "$3"
    else
        warn "Failed: $3"
    fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄  Restore from KingstonPhotos"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─────────────────────────────────────────────────────
# 1. Core keys (needed before bootstrap)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 1/7 — Core keys ━━━"

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
echo "━━━ 2/7 — Coding agents ━━━"

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
echo "━━━ 3/7 — App data ━━━"

for src in "$BACKUP/alfred" "$AGENTS/Alfred"; do
    [ -d "$src" ] && restore_dir "$src" ~/"Library/Application Support/Alfred" "Alfred (workflows, license)" && break
done

for src in "$APP_DATA/itsycal.plist" "$AGENTS/com.mowglii.ItsycalApp.plist"; do
    [ -f "$src" ] && restore_pref "$src" ~/Library/Preferences/com.mowglii.ItsycalApp.plist "Itsycal preferences" Itsycal && break
done

for src in "$BACKUP/logioptionsplus" "$AGENTS/LogiOptionsPlus"; do
    [ -d "$src" ] && restore_dir "$src" ~/"Library/Application Support/LogiOptionsPlus" "Logi Options+ config" && break
done

# ─────────────────────────────────────────────────────
# 4. Shell history
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 4/7 — Shell history ━━━"

for src in "$BACKUP/atuin" "$VOL/atuin"; do [ -d "$src" ] && restore_dir "$src" ~/.local/share/atuin "Atuin history" && break; done
for src in "$BACKUP/fish" "$VOL/fish"; do [ -d "$src" ] && restore_dir "$src" ~/.local/share/fish "Fish history" && break; done

# ─────────────────────────────────────────────────────
# 5. Projects (code repos)
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 5/7 — Projects ━━━"

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
echo "━━━ 6/7 — Config extras ━━━"

for src in "$BACKUP/herdr" "$AGENTS/herdr"; do [ -d "$src" ] && restore_dir "$src" ~/.config/herdr "Herdr config" && break; done
for src in "$BACKUP/mise" "$AGENTS/mise"; do [ -d "$src" ] && restore_dir "$src" ~/.config/mise "Mise config" && break; done

# ─────────────────────────────────────────────────────
# 7. Browser + game data
# ─────────────────────────────────────────────────────
echo ""
echo "━━━ 7/7 — Browser + game data ━━━"

# Zen browser profile
if [ -d "$BACKUP/zen-profile" ]; then
    ZEN_TARGET="$HOME/Library/Application Support/zen/Profiles/kmcqtbgb.Default (release)"
    mkdir -p "$(dirname "$ZEN_TARGET")" 2>/dev/null
    if [ -d "$ZEN_TARGET" ]; then
        skip "Zen browser profile"
    else
        restore_dir "$BACKUP/zen-profile" "$ZEN_TARGET" "Zen browser profile"
    fi
fi

# Minecraft worlds + config
if [ -d "$BACKUP/minecraft" ]; then
    MC_TARGET="$HOME/Library/Application Support/minecraft"
    if [ -d "$MC_TARGET/saves" ]; then
        skip "Minecraft worlds"
    else
        restore_dir "$BACKUP/minecraft/saves" "$MC_TARGET/saves" "Minecraft worlds"
    fi
    for cfg in launcher_accounts.json launcher_profiles.json options.txt servers.dat; do
        [ -f "$BACKUP/minecraft/$cfg" ] && restore_file "$BACKUP/minecraft/$cfg" "$MC_TARGET/$cfg" "Minecraft $cfg"
    done
fi

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
echo "    4. Restart Zen browser to load restored profile"
echo "    5. Launch Minecraft to see restored worlds"
echo ""
