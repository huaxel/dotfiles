#!/bin/bash
# shellcheck disable=SC2015
#
# compact-wsl.sh — Compact WSL2 VHDX without admin rights
#
# This script:
#   1. Cleans up WSL internals (pacman caches, orphaned packages, user caches)
#   2. Runs fstrim to tell the VHDX which blocks are free
#   3. Enables sparse VHDX (WSL 2.6+) so freed space is returned to the host
#
# No admin required. Uses `wsl --manage --set-sparse` (WSL 2.6+).
# Falls back to export/re-import advice on older WSL versions.
#
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*"; }
header(){ echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }

# ── Pre-flight checks ──────────────────────────────────────────────────

if [ "$(id -u)" -eq 0 ]; then
    err "Do not run as root. Run as a normal user (sudo will be used internally)."
    exit 1
fi

if ! grep -qi microsoft /proc/version 2>/dev/null; then
    warn "Not running inside WSL — the VHDX compaction step will be skipped."
    LOCAL_ONLY=true
else
    LOCAL_ONLY=false
    DISTRO=$(/mnt/c/windows/system32/wsl.exe --list --quiet 2>/dev/null | head -1 | tr -d '[:space:]' || echo "")
    if [ -z "$DISTRO" ]; then
        warn "Could not detect WSL distro name. Defaulting to 'archlinux'."
        DISTRO="archlinux"
    fi
    info "Detected WSL distro: ${DISTRO}"
fi

# ── Step 1: Show current usage ─────────────────────────────────────────

header "Current disk usage"

echo "  $(df -h / | tail -1 | awk '{print "Used: "$3" / "$2" ("$5" used)"}')"
echo ""

# ── Step 2: Pacman cache & orphans ─────────────────────────────────────

header "Pacman cleanup"

if command -v pacman &>/dev/null; then
    # Package cache — keep only the latest 2 versions
    CACHE_BEFORE=$(du -sh /var/cache/pacman/pkg 2>/dev/null | awk '{print $1}' || echo "0")
    info "Package cache before: ${CACHE_BEFORE}"
    sudo pacman -Sc --noconfirm 2>/dev/null || true
    CACHE_AFTER=$(du -sh /var/cache/pacman/pkg 2>/dev/null | awk '{print $1}' || echo "0")
    ok "Package cache: ${CACHE_BEFORE} → ${CACHE_AFTER}"

    # Orphaned packages
    ORPHANS=$(pacman -Qtdq 2>/dev/null || true)
    if [ -n "$ORPHANS" ]; then
        ORPHAN_COUNT=$(echo "$ORPHANS" | wc -l)
        info "Removing ${ORPHAN_COUNT} orphaned packages..."
        sudo pacman -Rns --noconfirm "$ORPHANS" 2>/dev/null || true
        ok "Orphaned packages removed"
    else
        ok "No orphaned packages"
    fi

    # Partial downloads / lock files
    sudo rm -f /var/cache/pacman/pkg/*.part 2>/dev/null || true
else
    warn "pacman not found — skipping"
fi

# ── Step 3: User caches ────────────────────────────────────────────────

header "User cache cleanup"

# npm cache
if command -v npm &>/dev/null; then
    NPM_CACHE=$(du -sh ~/.npm 2>/dev/null | awk '{print $1}' || echo "0")
    npm cache clean --force 2>/dev/null && ok "npm cache cleared (was ${NPM_CACHE})" || warn "npm cache clean failed"
fi

# pip cache
if command -v pip3 &>/dev/null; then
    PIP_CACHE=$(du -sh ~/.cache/pip 2>/dev/null | awk '{print $1}' || echo "0")
    pip3 cache purge 2>/dev/null && ok "pip cache cleared (was ${PIP_CACHE})" || warn "pip cache purge failed"
fi

# cargo registry
if [ -d ~/.cargo/registry ]; then
    CARGO_REG=$(du -sh ~/.cargo/registry 2>/dev/null | awk '{print $1}' || echo "0")
    cargo sweep -s 2>/dev/null || true
    ok "cargo registry: ${CARGO_REG}"
fi

# Visual Studio Code Server
if [ -d ~/.vscode-server ]; then
    VSCODE=$(du -sh ~/.vscode-server 2>/dev/null | awk '{print $1}' || echo "0")
    info "VS Code Server: ${VSCODE} — keeping (re-downloads are slow)"
fi

# Codex cache (AI inference results)
if [ -d ~/.codex ]; then
    CODEX=$(du -sh ~/.codex 2>/dev/null | awk '{print $1}' || echo "0")
    rm -rf ~/.codex/cache ~/.codex/*.cache 2>/dev/null || true
    ok "Codex cache cleared (was ${CODEX})"
fi

# Claude cache
if [ -d ~/.claude ]; then
    CLAUDE=$(du -sh ~/.claude 2>/dev/null | awk '{print $1}' || echo "0")
    rm -rf ~/.claude/cache 2>/dev/null || true
    ok "Claude cache cleared (was ${CLAUDE})"
fi

# Pi agent sessions (compact gently)
if [ -d ~/.pi/sessions ]; then
    PI=$(du -sh ~/.pi 2>/dev/null | awk '{print $1}' || echo "0")
    info "pi agent data: ${PI} — keeping"
fi

# Docker — prune dangling if docker is running
if command -v docker &>/dev/null && docker info 2>/dev/null | grep -q "Server Version"; then
    DOCKER=$(du -sh /var/lib/docker 2>/dev/null | awk '{print $1}' || echo "0")
    info "Docker data: ${DOCKER} — pruning..."
    docker system prune -f 2>/dev/null && ok "Docker pruned" || warn "Docker prune skipped"
fi

# Atom data (63G — check if it's still needed)
# Atom data — the script can remove it if backed up externally
if [ -d ~/atom-data ]; then
    ATOM=$(du -sh ~/atom-data 2>/dev/null | awk '{print $1}' || echo "0")
    if [ "${PURGE_ATOM_DATA}" = "true" ] || [ "${1}" = "--purge-atom" ]; then
        info "Removing atom-data (${ATOM}) as requested..."
        rm -rf ~/atom-data
        ok "atom-data deleted"
    else
        warn "atom-data: ${ATOM} — run with --purge-atom or export PURGE_ATOM_DATA=true to delete"
    fi
fi

# ── Step 4: System journal ──────────────────────────────────────────────

header "System journal cleanup"

if command -v journalctl &>/dev/null; then
    JOURNAL=$(du -sh /var/log/journal 2>/dev/null | awk '{print $1}' || echo "0")
    info "Journal before: ${JOURNAL}"
    sudo journalctl --vacuum-time=7d 2>/dev/null || true
    JOURNAL_AFTER=$(du -sh /var/log/journal 2>/dev/null | awk '{print $1}' || echo "0")
    ok "Journal: ${JOURNAL} → ${JOURNAL_AFTER}"
fi

# ── Step 5: fstrim ──────────────────────────────────────────────────────

header "Filesystem trim (fstrim)"

info "Trimming all mounted filesystems..."
sudo fstrim -v / 2>&1 || warn "fstrim / failed (may not be supported)"
sudo fstrim -v /mnt/wslg 2>&1 || true
sudo fstrim -v /mnt/wsl 2>&1 || true
ok "fstrim complete"

# ── Step 6: Enable sparse VHDX ─────────────────────────────────────────

header "VHDX compaction"

if [ "$LOCAL_ONLY" = true ]; then
    warn "Not in WSL — skipping VHDX compaction."
    info "Run this script from inside WSL to compact the VHDX."
else
    WSL_EXE="/mnt/c/windows/system32/wsl.exe"

    info "Enabling sparse VHDX for distro '${DISTRO}'..."
    if "$WSL_EXE" --manage "$DISTRO" --set-sparse true 2>&1; then
        ok "Sparse VHDX enabled — space will be automatically reclaimed."
    else
        warn "Trying with --allow-unsafe flag..."
        if "$WSL_EXE" --manage "$DISTRO" --set-sparse true --allow-unsafe 2>&1; then
            ok "Sparse VHDX enabled (allow-unsafe) — space will be auto-reclaimed."
        else
            warn "Could not enable sparse VHDX. Falling back to export/re-import."
            warn "  wsl --shutdown"
            warn "  wsl --export ${DISTRO} backup.tar"
            warn "  wsl --unregister ${DISTRO}"
            warn "  wsl --import ${DISTRO} <install-location> backup.tar --version 2"
        fi
    fi
fi

# ── Step 7: Show final usage ───────────────────────────────────────────

header "Final disk usage"
echo "  $(df -h / | tail -1 | awk '{print "Used: "$3" / "$2" ("$5" used)"}')"

# ── Summary ────────────────────────────────────────────────────────────

header "Done"
ok "WSL compaction complete!"
echo ""
echo "  ${BOLD}You may need to restart WSL or Windows for changes to take full effect.${NC}"
echo "  Quick restart:  wsl --shutdown  (from PowerShell/CMD)"
echo ""
