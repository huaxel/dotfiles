#!/usr/bin/env bash
# Backup machine state to a removable volume before migration or recovery.
#
# Usage: ./scripts/backup-to-kingston.sh
# Test/alternate destination: BACKUP_VOLUME=/path/to/volume ./scripts/backup-to-kingston.sh
#
# A backup is restorable by default only when it contains .backup-complete.

set -euo pipefail
umask 077

VOL="${BACKUP_VOLUME:-/Volumes/KingstonPhotos}"
DATE="${BACKUP_DATE:-$(date +%Y%m%d-%H%M)}"
HOST="${BACKUP_HOST:-$(hostname -s 2>/dev/null || echo mac)}"
DOTFILES_DIR="${DOTFILES_DIR:-$HOME/dotfiles}"
PI_SOURCE="${PI_CODING_AGENT_DIR:-$DOTFILES_DIR/pi/agent}"
# Write under projects/ because the real volume root may be root-owned.
DEST="${BACKUP_DEST:-$VOL/projects/backup-$HOST-$DATE}"
FAILURES=0
WARNINGS=0

info() { echo "  $*"; }
ok() { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo "  ❌ $*"; FAILURES=$((FAILURES + 1)); }

# backup_tree <source> <relative destination> <label> [required|strict|volatile] [rsync args...]
# - required: a missing source or any copy error fails the backup
# - strict: an existing source must copy completely; a missing source is skipped
# - volatile: rsync 23/24 is accepted with a warning for live cache/state trees
backup_tree() {
  local src="$1" relative="$2" label="$3" policy="${4:-strict}"
  shift 4 || true
  if [ ! -d "$src" ]; then
    if [ "$policy" = "required" ]; then fail "Missing required source: $label ($src)"; fi
    return 0
  fi
  local target="$DEST/$relative" rc
  mkdir -p "$target"
  if rsync -a "$@" "$src"/ "$target"/; then
    ok "$label"
    return 0
  else
    rc=$?
  fi
  if [ "$policy" = "volatile" ] && { [ "$rc" -eq 23 ] || [ "$rc" -eq 24 ]; }; then
    warn "$label copied with live-file changes (rsync $rc)"
  else
    fail "$label failed (rsync $rc)"
  fi
  return 0
}

# backup_file <source> <relative destination file> <label> [required|strict]
backup_file() {
  local src="$1" relative="$2" label="$3" policy="${4:-strict}"
  if [ ! -f "$src" ]; then
    if [ "$policy" = "required" ]; then fail "Missing required source: $label ($src)"; fi
    return 0
  fi
  mkdir -p "$(dirname "$DEST/$relative")"
  if cp -p "$src" "$DEST/$relative"; then ok "$label"; else fail "$label failed"; fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  💾  Backup to $(basename "$VOL")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Destination: $DEST"
echo ""

if [ ! -d "$VOL" ]; then
  echo "  ❌ Backup volume not mounted at $VOL"
  exit 1
fi

# This backup contains private age/SSH/GPG keys. On macOS, refuse a volume
# whose backing device is not encrypted unless the operator explicitly accepts
# that risk for one run.
if [ "$(uname -s)" = "Darwin" ] && command -v diskutil >/dev/null 2>&1; then
  volume_device=$(df "$VOL" | awk 'NR==2 {print $1}')
  volume_info=$(diskutil info "$volume_device" 2>/dev/null || true)
  if ! printf '%s\n' "$volume_info" | grep -Eq '^[[:space:]]*(Encrypted|FileVault):[[:space:]]+Yes'; then
    if [ "${ALLOW_UNENCRYPTED_BACKUP:-0}" != "1" ]; then
      echo "  ❌ Refusing to copy private keys to an unencrypted volume: $VOL"
      echo "     Use an encrypted destination. Override once with ALLOW_UNENCRYPTED_BACKUP=1."
      exit 1
    fi
    warn "Proceeding with explicitly approved unencrypted backup volume"
  else
    ok "Backup volume encryption verified"
  fi
fi

if [ "${BACKUP_PREFLIGHT_ONLY:-0}" = "1" ]; then
  if [ ! -f "$HOME/.config/sops/age/keys.txt" ]; then
    echo "  ❌ Missing required Age key: $HOME/.config/sops/age/keys.txt"
    exit 1
  fi
  ok "Required Age key present"
  df -h "$VOL" | tail -n 1 | sed 's/^/  /'
  if [ -d "$PI_SOURCE/sessions" ]; then
    info "Canonical Pi sessions: $(du -sh "$PI_SOURCE/sessions" | cut -f1)"
  fi
  echo "  ✅ Backup preflight passed"
  exit 0
fi

mkdir -p "$DEST"
rm -f "$DEST/.backup-complete"

# ── 1. Core keys ──────────────────────────────────────
echo "━━━ 1/6 — Core keys ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "$HOME/.config/sops/age/keys.txt" ]; then
  backup_tree "$HOME/.config/sops/age" keys "Age key" required
else
  fail "Missing required Age key ($HOME/.config/sops/age/keys.txt)"
fi
backup_tree "$HOME/.ssh" ssh "SSH keys" strict
backup_tree "$HOME/.gnupg" gnupg "GPG keys" strict

# ── 2. Coding agents ──────────────────────────────────
echo "━━━ 2/6 — Coding agents ━━━━━━━━━━━━━━━━━━━━━━━━━"
backup_tree "$HOME/.claude" claude "Claude CLI" volatile
backup_tree "$HOME/.codex" codex "Codex CLI" volatile
backup_tree "$HOME/.config/github-copilot" github-copilot "GitHub Copilot" strict
backup_tree "$HOME/.gemini" gemini "Gemini CLI" volatile
backup_tree "$HOME/.wakatime" wakatime "WakaTime" strict
backup_tree "$HOME/.cursor" cursor "Cursor" volatile
backup_tree "$HOME/.copilot" copilot-hooks "Copilot hooks" strict
backup_tree "$HOME/.config/opencode" opencode "OpenCode" volatile
backup_tree "$HOME/.config/devin" devin "Devin" strict
backup_tree "$HOME/.orca" orca "Orca" volatile
backup_tree "$HOME/.kimi-code" kimi-code "Kimi Code" volatile
backup_tree "$HOME/.jules" jules "Jules" volatile
backup_tree "$HOME/.grok" grok "Grok" volatile
backup_tree "$HOME/.config/herdr" herdr "Herdr" volatile
backup_tree "$HOME/.config/mise" mise "Mise config" strict

# OAuth and quota credentials are deliberately excluded. They are machine-local
# and should be recreated/decrypted on the destination rather than copied to a
# potentially unencrypted removable disk.
PI_EXCLUDES=(--exclude=/auth.json --exclude=/quota-sessions.json)
backup_tree "$HOME/.pi/agent" pi "Pi fallback state" volatile "${PI_EXCLUDES[@]}"
if [ -d "$PI_SOURCE" ] && [ "$(cd "$PI_SOURCE" && pwd -P)" != "$(cd "$HOME/.pi/agent" 2>/dev/null && pwd -P || true)" ]; then
  # Back up runtime state only. Copying the whole source directory would later
  # overwrite tracked settings/extensions in a freshly cloned repository.
  backup_tree "$PI_SOURCE/sessions" pi-dotfiles/sessions "Pi canonical sessions" strict
  backup_tree "$PI_SOURCE/state" pi-dotfiles/state "Pi extension state" volatile
  backup_tree "$PI_SOURCE/observability" pi-dotfiles/observability "Pi observability" volatile
  backup_tree "$PI_SOURCE/intercom" pi-dotfiles/intercom "Pi intercom state" volatile
  backup_file "$PI_SOURCE/run-history.jsonl" pi-dotfiles/run-history.jsonl "Pi run history"
  backup_file "$PI_SOURCE/pi-crash.log" pi-dotfiles/pi-crash.log "Pi crash log"
  backup_file "$PI_SOURCE/opencode-go-failover-state.json" pi-dotfiles/opencode-go-failover-state.json "Pi failover state"
  backup_file "$PI_SOURCE/opencode-go-failover.log" pi-dotfiles/opencode-go-failover.log "Pi failover log"
fi

backup_tree "$HOME/Library/Application Support/Claude" claude-desktop "Claude Desktop data" volatile

if [ -f "$HOME/.local/bin/opencodebar" ]; then
  backup_file "$HOME/.local/bin/opencodebar" opencodebar/opencodebar "OpenCodeBar"
elif [ -d "$HOME/.local/bin/opencodebar" ]; then
  backup_tree "$HOME/.local/bin/opencodebar" opencodebar "OpenCodeBar" strict
fi
backup_tree "$HOME/Library/Application Support/CodexBar" codexbar "CodexBar" volatile

# ── 3. App data ───────────────────────────────────────
echo "━━━ 3/6 — App data ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
backup_tree "$HOME/Library/Application Support/Alfred" alfred "Alfred" volatile
backup_file "$HOME/Library/Preferences/com.mowglii.ItsycalApp.plist" itsycal.plist "Itsycal preferences"
backup_tree "$HOME/Library/Application Support/LogiOptionsPlus" logioptionsplus "Logi Options+" volatile
for f in "$HOME"/Library/Preferences/com.displaylink.*.plist; do
  [ -f "$f" ] || continue
  backup_file "$f" "displaylink-preferences/$(basename "$f")" "$(basename "$f")"
done

# ── 4. Shell history ──────────────────────────────────
echo "━━━ 4/6 — Shell history ━━━━━━━━━━━━━━━━━━━━━━━━━"
backup_tree "$HOME/.local/share/atuin" atuin "Atuin history" strict
backup_tree "$HOME/.local/share/fish" fish "Fish history" strict
backup_tree "$HOME/.config/nushell" nushell "Nushell config and history" volatile

# ── 5. Projects ───────────────────────────────────────
echo "━━━ 5/6 — Projects ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for dir in "$HOME"/projects/*/ "$HOME"/coding/projects/*/; do
  [ -d "$dir/.git" ] || continue
  name=$(basename "$dir")
  backup_tree "$dir" "projects/$name" "projects/$name" strict
 done

# ── 6. Browser + game data ────────────────────────────
echo "━━━ 6/6 — Browser + game data ━━━━━━━━━━━━━━━━━━━"
ZEN_PROFILE="$HOME/Library/Application Support/zen/Profiles/kmcqtbgb.Default (release)"
backup_tree "$ZEN_PROFILE" zen-profile "Zen browser profile" volatile \
  --exclude=/storage/ --exclude=/cache/ --exclude=/Cache/ \
  --exclude=/startupCache/ --exclude=/cache2/ \
  --exclude='*.sqlite-wal' --exclude='*.sqlite-shm'

MC_DIR="$HOME/Library/Application Support/minecraft"
backup_tree "$MC_DIR/saves" minecraft/saves "Minecraft worlds" strict
for cfg in launcher_accounts.json launcher_profiles.json options.txt servers.dat; do
  backup_file "$MC_DIR/$cfg" "minecraft/$cfg" "Minecraft $cfg"
done

# ── Completion marker ─────────────────────────────────
echo ""
if [ "$FAILURES" -gt 0 ]; then
  rm -f "$DEST/.backup-complete"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ❌ Backup incomplete: $FAILURES failure(s), $WARNINGS warning(s)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Incomplete data remains at: $DEST"
  exit 1
fi

{
  echo "format=1"
  echo "completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_host=$HOST"
  echo "warnings=$WARNINGS"
} > "$DEST/.backup-complete"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Backup complete and verified ($WARNINGS warning(s))"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Restore with: $DOTFILES_DIR/scripts/restore-from-kingston.sh"
echo "  Backup: $DEST"
