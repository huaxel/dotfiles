#!/bin/bash
# vpn-watch.sh — Monitor Azure VPN (Qlik-Env) and auto-reconnect from WSL
# Uses the Windows VPN client via PowerShell, since WSL can use the VPN tunnel directly
# (eth4 in mirrored networking mode)

set -euo pipefail

VPN_NAME="${1:-Qlik-Env}"
CHECK_TARGET="${2:-10.7.0.4}"           # A reliable internal IP to ping
POLL_INTERVAL="${3:-30}"                 # Seconds between checks
PING_TIMEOUT="${4:-5}"                   # Seconds per ping attempt
PING_RETRIES="${5:-3}"                   # Consecutive failures before reconnect
LOG_FILE="${6:-/tmp/vpn-watch.log}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

reconnect_vpn() {
    log "🔄 Disconnecting $VPN_NAME..."
    powershell.exe -Command "rasdial '$VPN_NAME' /disconnect" 2>/dev/null || true
    sleep 3
    
    log "🔄 Reconnecting $VPN_NAME..."
    if powershell.exe -Command "rasdial '$VPN_NAME'"; then
        log "✅ VPN reconnected successfully"
        sleep 5  # Wait for routes to settle
        return 0
    else
        log "❌ VPN reconnection failed"
        return 1
    fi
}

is_vpn_connected() {
    # Method 1: Check if eth4 has the VPN's IP (mirrored networking)
    if ip addr show eth4 2>/dev/null | grep -q "10\."; then
        # Method 2: Verify we can reach the internal target
        if ping -c 1 -W "$PING_TIMEOUT" "$CHECK_TARGET" >/dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Method 3: Check Windows VPN status as fallback
    if powershell.exe -Command "(Get-VpnConnection -Name '$VPN_NAME').ConnectionStatus -eq 'Connected'" 2>/dev/null | grep -q "True"; then
        # Give it a moment for routes to propagate
        sleep 5
        if ping -c 1 -W "$PING_TIMEOUT" "$CHECK_TARGET" >/dev/null 2>&1; then
            return 0
        fi
    fi
    
    return 1
}

# Main monitoring loop
log "🚀 VPN Watch started for '$VPN_NAME' (checking $CHECK_TARGET every ${POLL_INTERVAL}s)"
log "   Log: $LOG_FILE"

failure_count=0

while true; do
    if is_vpn_connected; then
        if [ $failure_count -gt 0 ]; then
            log "✅ VPN connection restored after $failure_count failure(s)"
            failure_count=0
        fi
        sleep "$POLL_INTERVAL"
    else
        failure_count=$((failure_count + 1))
        log "⚠️  Connection check failed ($failure_count/$PING_RETRIES)"
        
        if [ "$failure_count" -ge "$PING_RETRIES" ]; then
            log "🔴 VPN is down, attempting reconnect..."
            reconnect_vpn || true
            failure_count=0
        fi
        
        sleep "$((POLL_INTERVAL / 2))"
    fi
done
