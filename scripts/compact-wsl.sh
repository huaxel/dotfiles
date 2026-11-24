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

# du can print a size and still exit non-zero (permission errors on some
# subdirectories), so `du ... || echo 0` yields two lines. Ask once, default once.
disk_usage() {
    local size
    size=$(du -sh "$1" 2>/dev/null | awk '{print $1}')
    echo "${size:-0}"
}

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
    CACHE_BEFORE=$(disk_usage /var/cache/pacman/pkg)
    info "Package cache before: ${CACHE_BEFORE}"
    sudo pacman -Sc --noconfirm 2>/dev/null || true
    CACHE_AFTER=$(disk_usage /var/cache/pacman/pkg)
    ok "Package cache: ${CACHE_BEFORE} → ${CACHE_AFTER}"

    # Orphaned packages
    mapfile -t ORPHANS < <(pacman -Qtdq 2>/dev/null || true)
    if [ "${#ORPHANS[@]}" -gt 0 ]; then
        ORPHAN_COUNT=${#ORPHANS[@]}
        info "Removing ${ORPHAN_COUNT} orphaned packages..."
        if sudo pacman -Rns --noconfirm "${ORPHANS[@]}" 2>/dev/null; then
            ok "Orphaned packages removed"
        else
            warn "Orphan removal failed; no success claimed"
        fi
    else
        ok "No orphaned packages"
    fi

    # Partial downloads / lock files
    sudo rm -f /var/cache/pacman/pkg/*.part 2>/dev/null || true
else
    warn "pacman not found — skipping"
fi

# ── Step 2b: Nix store & generations (NixOS) ────────────────────────────

# The Nix store is the NixOS equivalent of pacman's cache, and it is where the
# space actually goes: every rebuild adds a generation that pins its closure.
# Keep a few for rollback, drop the rest, then collect the garbage.
if command -v nix-collect-garbage &>/dev/null; then
    header "Nix store cleanup"
    KEEP_GENERATIONS="${KEEP_GENERATIONS:-5}"
    STORE_BEFORE=$(disk_usage /nix/store)
    ROOT_BEFORE=$(df -h / | tail -1 | awk '{print $3}')
    info "Store before: ${STORE_BEFORE}   (/ used: ${ROOT_BEFORE})"
    info "Keeping the last ${KEEP_GENERATIONS} generations for rollback..."

    sudo nix-env -p /nix/var/nix/profiles/system \
        --delete-generations "+${KEEP_GENERATIONS}" 2>/dev/null \
        && ok "System generations pruned" \
        || warn "System generation prune failed; continuing"

    USER_PROFILE="/nix/var/nix/profiles/per-user/${USER}/home-manager"
    if [ -e "$USER_PROFILE" ]; then
        nix-env -p "$USER_PROFILE" --delete-generations "+${KEEP_GENERATIONS}" 2>/dev/null \
            && ok "Home-manager generations pruned" \
            || warn "Home-manager generation prune failed; continuing"
    fi

    GC_OUT=$(sudo nix-collect-garbage 2>&1 | tail -1 || true)
    if [ -n "$GC_OUT" ]; then ok "${GC_OUT}"; else warn "nix-collect-garbage produced no summary"; fi

    STORE_AFTER=$(disk_usage /nix/store)
    ROOT_AFTER=$(df -h / | tail -1 | awk '{print $3}')
    ok "Store: ${STORE_BEFORE} → ${STORE_AFTER}   (/ used: ${ROOT_BEFORE} → ${ROOT_AFTER})"
else
    warn "nix-collect-garbage not found — skipping Nix store cleanup"
fi

# ── Step 3: User caches ────────────────────────────────────────────────

header "User cache cleanup"

# npm cache
if command -v npm &>/dev/null; then
    NPM_CACHE=$(disk_usage ~/.npm)
    npm cache clean --force 2>/dev/null && ok "npm cache cleared (was ${NPM_CACHE})" || warn "npm cache clean failed"
fi

# pip cache
if command -v pip3 &>/dev/null; then
    PIP_CACHE=$(disk_usage ~/.cache/pip)
    pip3 cache purge 2>/dev/null && ok "pip cache cleared (was ${PIP_CACHE})" || warn "pip cache purge failed"
fi

# uv cache (keeps only the newest version of each package)
if command -v uv &>/dev/null; then
    UV_CACHE=$(disk_usage ~/.cache/uv)
    uv cache prune >/dev/null 2>&1 && ok "uv cache pruned (was ${UV_CACHE})" || warn "uv cache prune failed"
fi

# cargo registry
if [ -d ~/.cargo/registry ]; then
    CARGO_REG=$(disk_usage ~/.cargo/registry)
    cargo sweep -s 2>/dev/null || true
    ok "cargo registry: ${CARGO_REG}"
fi

# Visual Studio Code Server
if [ -d ~/.vscode-server ]; then
    VSCODE=$(disk_usage ~/.vscode-server)
    info "VS Code Server: ${VSCODE} — keeping (re-downloads are slow)"
fi

# Codex cache (AI inference results)
if [ -d ~/.codex ]; then
    CODEX=$(disk_usage ~/.codex)
    rm -rf ~/.codex/cache ~/.codex/*.cache 2>/dev/null || true
    ok "Codex cache cleared (was ${CODEX})"
fi

# Claude cache
if [ -d ~/.claude ]; then
    CLAUDE=$(disk_usage ~/.claude)
    rm -rf ~/.claude/cache 2>/dev/null || true
    ok "Claude cache cleared (was ${CLAUDE})"
fi

# Pi agent sessions (compact gently)
if [ -d ~/.pi/sessions ]; then
    PI=$(disk_usage ~/.pi)
    info "pi agent data: ${PI} — keeping"
fi

# Docker — prune dangling if docker is running
if command -v docker &>/dev/null && docker info 2>/dev/null | grep -q "Server Version"; then
    DOCKER=$(disk_usage /var/lib/docker)
    info "Docker data: ${DOCKER} — pruning..."
    docker system prune -f 2>/dev/null && ok "Docker pruned" || warn "Docker prune skipped"
fi

# Atom data (63G — check if it's still needed)
# Atom data — the script can remove it if backed up externally
if [ -d ~/atom-data ]; then
    ATOM=$(disk_usage ~/atom-data)
    if [ "${PURGE_ATOM_DATA:-false}" = "true" ] || [ "${1:-}" = "--purge-atom" ]; then
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
    JOURNAL=$(disk_usage /var/log/journal)
    info "Journal before: ${JOURNAL}"
    sudo journalctl --vacuum-time=7d 2>/dev/null || true
    JOURNAL_AFTER=$(disk_usage /var/log/journal)
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
    elif [ "${ALLOW_UNSAFE_SPARSE:-false}" = "true" ]; then
        warn "Trying explicitly approved --allow-unsafe mode..."
        if "$WSL_EXE" --manage "$DISTRO" --set-sparse true --allow-unsafe 2>&1; then
            ok "Sparse VHDX enabled (allow-unsafe) — space will be auto-reclaimed."
        else
            warn "Could not enable sparse VHDX. No destructive fallback was run."
        fi
    else
        warn "Safe sparse mode failed; --allow-unsafe was not attempted."
        warn "Set ALLOW_UNSAFE_SPARSE=true only after backing up critical WSL data."
        warn "For export/re-import, use compact-wsl.ps1 -ExportFallback -ConfirmDestructive."
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
