#!/usr/bin/env bash
# WSL VPN & Network Drive Setup
# ==============================
# Enables WSL Interop (running Windows exes from WSL) and reconnects
# the Qlik-Env Azure VPN so CIFS mounts (e.g. /mnt/atomsrc) work.
#
# Usage: ./scripts/wsl-vpn-setup.sh [command]
#
# Commands:
#   setup       Register WSLInterop binfmt (run once, persists across boots)
#   status      Check VPN and mount status
#   reconnect   Reconnect the Qlik-Env VPN
#   mount       Mount /mnt/atomsrc
#   route       Show routing info
#   all         Run setup, reconnect, and mount (default)
#
# For a quick alias, add to your shell config (~/.config/fish/config.fish,
# ~/.config/nushell/config.nu, or ~/.config/environment.d for env vars):
#   alias vpn-reconnect='~/dotfiles/scripts/wsl-vpn-setup.sh reconnect'

set -euo pipefail

POWERSHELL="/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}→${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*"; }

# ── 1. Register WSLInterop binfmt (permanent) ──────────────────────────

setup_interop() {
    info "Checking WSLInterop binfmt registration..."

    if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        ok "WSLInterop is already registered."
        return 0
    fi

    info "Registering WSLInterop via /etc/binfmt.d/wsl.conf..."

    # systemd-binfmt loads entries from /etc/binfmt.d/ on boot
    echo ':WSLInterop:M::MZ::/init:' | sudo tee /etc/binfmt.d/wsl.conf >/dev/null

    # Apply immediately (no reboot needed)
    echo ':WSLInterop:M::MZ::/init:' | sudo tee /proc/sys/fs/binfmt_misc/register >/dev/null
    ok "WSLInterop registered (this session + permanent on next boot)."
}

# ── 2. Check VPN status ────────────────────────────────────────────────

check_vpn() {
    info "Checking VPN status..."

    if [[ ! -x "$POWERSHELL" ]]; then
        warn "powershell.exe not found at $POWERSHELL"
        return 1
    fi

    local status
    status=$("$POWERSHELL" -Command "
        \$vpn = Get-VpnConnection -Name 'Qlik-Env' -ErrorAction SilentlyContinue;
        if (\$vpn -and \$vpn.ConnectionStatus -eq 'Connected') {
            Write-Host 'connected'
        } else {
            Write-Host 'disconnected'
        }
    " 2>/dev/null | tr -d '\r')

    case "$status" in
        connected)
            ok "Qlik-Env VPN is connected."
            return 0
            ;;
        disconnected)
            warn "Qlik-Env VPN is disconnected."
            return 2
            ;;
        *)
            warn "Could not determine VPN status."
            return 1
            ;;
    esac
}

# ── 3. Reconnect VPN ──────────────────────────────────────────────────

reconnect_vpn() {
    info "Reconnecting Qlik-Env VPN..."
    "$POWERSHELL" -Command "rasdial 'Qlik-Env'" 2>&1 | while IFS= read -r line; do
        info "  $line"
    done

    sleep 2

    if check_vpn; then
        ok "VPN reconnected."
    else
        err "VPN reconnection failed."
        return 1
    fi
}

# ── 4. Mount atomsrc ───────────────────────────────────────────────────

mount_atomsrc() {
    if mountpoint -q /mnt/atomsrc 2>/dev/null; then
        ok "/mnt/atomsrc is already mounted."
        return 0
    fi

    info "Mounting /mnt/atomsrc..."
    if sudo mount /mnt/atomsrc 2>&1; then
        ok "/mnt/atomsrc mounted."
    else
        err "Mount failed — is the VPN connected?"
        return 1
    fi
}

# ── 5. Show routing ────────────────────────────────────────────────────

show_routing() {
    echo
    echo -e "${CYAN}━━━ Route to 10.7.0.4 ━━━${NC}"
    ip route get 10.7.0.4 2>&1 || echo "No route"

    echo -e "${CYAN}━━━ VPN interface ━━━${NC}"
    ip addr show eth5 2>/dev/null || echo "eth5 not found (VPN may be disconnected)"

    echo -e "${CYAN}━━━ atomsrc mount ━━━${NC}"
    mount | grep atomsrc || echo "Not mounted"

    echo -e "${CYAN}━━━ WSLInterop ━━━${NC}"
    cat /proc/sys/fs/binfmt_misc/WSLInterop 2>/dev/null || echo "Not registered"
}

# ── Help ────────────────────────────────────────────────────────────────

usage() {
    sed -n '4,19p' "$0"
    exit 0
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    case "${1:-all}" in
        setup)     setup_interop ;;
        status)    check_vpn && mount_atomsrc ;;
        reconnect) reconnect_vpn ;;
        mount)     mount_atomsrc ;;
        route)     show_routing ;;
        all)
            setup_interop
            echo
            if ! check_vpn; then
                reconnect_vpn
            fi
            echo
            mount_atomsrc
            echo
            show_routing
            ;;
        help|--help|-h) usage ;;
        *)
            err "Unknown command: $1"
            usage
            ;;
    esac
}

main "$@"
