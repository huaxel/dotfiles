#!/bin/bash
# agy-usage-proxy-setup.sh — Install/update the agy usage interceptor on any machine.
#
# Run this once on each machine where you use `agy`:
#   curl -fsSL <url> | bash
#   # or from the dotfiles repo:
#   ./bin/agy-usage-proxy-setup.sh
#
# What it does:
#   1. Symlinks the mitmproxy addon → ~/.config/antigravity-usage/
#   2. Symlinks the systemd service → ~/.config/systemd/user/
#   3. Symlinks the fish wrapper function → ~/.config/fish/functions/
#   4. Installs mitmproxy (via pipx) if missing
#   5. Generates the mitmproxy CA certificate
#   6. Trusts it system-wide (requires sudo, one-time)
#   7. Regenerates the PEM bundle Go reads
#   8. Enables and starts the systemd service
#
# Idempotent — safe to re-run.

set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADDON_SRC="$DOTFILES/config/antigravity-usage/proxy-addon.py"
SERVICE_SRC="$DOTFILES/config/systemd/user/agy-usage-proxy.service"
FISH_FN_SRC="$DOTFILES/config/fish/functions/agy.fish"

ADDON_DST="$HOME/.config/antigravity-usage/proxy-addon.py"
SERVICE_DST="$HOME/.config/systemd/user/agy-usage-proxy.service"
FISH_FN_DST="$HOME/.config/fish/functions/agy.fish"
USAGE_LOG="$HOME/.config/antigravity-usage/usage.jsonl"

info()  { echo "  $*"; }
step()  { echo ""; echo "━━━ $* ━━━"; }
warn()  { echo "  ⚠️  $*"; }
err()   { echo "  ❌ $*"; }

# ─────────────────────────────────────────────────────────────────
step "1/7 — Ensure mitmproxy is installed"

if command -v mitmdump &>/dev/null; then
  info "mitmdump found: $(mitmdump --version 2>&1 | head -1)"
else
  # Ensure pipx is available — try system package managers first
  if ! command -v pipx &>/dev/null; then
    if command -v pacman &>/dev/null; then
      info "Installing pipx via pacman..."
      sudo pacman -S --noconfirm python-pipx
    elif command -v brew &>/dev/null; then
      info "Installing pipx via brew..."
      brew install pipx
      pipx ensurepath
    elif command -v apt-get &>/dev/null; then
      info "Installing pipx via apt..."
      sudo apt-get install -y pipx
      pipx ensurepath
    elif command -v pip3 &>/dev/null; then
      # Fallback — try pip3 with --break-system-packages on Arch-like
      info "Installing mitmproxy via pip3..."
      pip3 install --user --break-system-packages mitmproxy 2>/dev/null || \
        pip3 install --user mitmproxy 2>/dev/null || {
        err "Could not install mitmproxy. Try: pipx install mitmproxy"
        exit 1
      }
      return 0 2>/dev/null || true
    else
      err "No package manager found. Install pipx first, then re-run:"
      err "  pipx install mitmproxy"
      exit 1
    fi
  fi

  if command -v pipx &>/dev/null; then
    info "Installing mitmproxy via pipx..."
    pipx install mitmproxy
  fi
fi

# ─────────────────────────────────────────────────────────────────
step "2/7 — Symlink addon script"

mkdir -p "$HOME/.config/antigravity-usage"
if [ -f "$ADDON_DST" ]; then
  rm -f "$ADDON_DST"
fi
ln -sf "$ADDON_SRC" "$ADDON_DST"
info "addon → $ADDON_DST"

# ─────────────────────────────────────────────────────────────────
step "3/7 — Symlink systemd user service"

mkdir -p "$HOME/.config/systemd/user"
if [ -f "$SERVICE_DST" ]; then
  rm -f "$SERVICE_DST"
fi
ln -sf "$SERVICE_SRC" "$SERVICE_DST"
info "service → $SERVICE_DST"

systemctl --user daemon-reload 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────
step "4/7 — Symlink fish wrapper function"

mkdir -p "$HOME/.config/fish/functions"
if [ -f "$FISH_FN_DST" ]; then
  rm -f "$FISH_FN_DST"
fi
ln -sf "$FISH_FN_SRC" "$FISH_FN_DST"
info "fish function → $FISH_FN_DST"

# Also register it immediately in any running fish session
fish -c "source $FISH_FN_DST" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────
step "5/7 — Generate mitmproxy CA certificate"

MITM_DIR="$HOME/.mitmproxy"
MITM_CERT="$MITM_DIR/mitmproxy-ca-cert.pem"

if [ ! -f "$MITM_CERT" ]; then
  info "Starting mitmdump briefly to generate CA cert..."
  mitmdump --listen-port 8081 -s "$ADDON_DST" &
  PID=$!
  sleep 2
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  info "CA cert generated at $MITM_CERT"
else
  info "CA cert already exists at $MITM_CERT"
fi

# ─────────────────────────────────────────────────────────────────
step "6/7 — Trust CA certificate system-wide"

if command -v trust &>/dev/null; then
  if ! trust list 2>/dev/null | grep -q "mitmproxy"; then
    info "Adding mitmproxy CA to system trust store (needs sudo)..."
    sudo trust anchor "$MITM_CERT"
    info "Regenerating PEM bundle for Go..."
    sudo p11-kit extract --format=pem-bundle --filter=ca-anchors \
      --overwrite --comment /etc/ca-certificates/extracted/tls-ca-bundle.pem 2>/dev/null || true
    info "CA cert trusted ✅"
  else
    info "CA cert already trusted"
  fi
elif [ "$(uname -s)" = "Darwin" ]; then
  info "Adding mitmproxy CA to macOS keychain..."
  sudo security add-trusted-cert -d -p ssl -r trustRoot \
    -k /Library/Keychains/System.keychain "$MITM_CERT" 2>/dev/null || \
    security add-trusted-cert -d -p ssl -r trustRoot \
      -k ~/Library/Keychains/login.keychain "$MITM_CERT" 2>/dev/null || \
    warn "Could not trust cert. Do it manually: open $MITM_CERT"
else
  warn "Unknown platform — trust the CA cert manually:"
  warn "  sudo trust anchor $MITM_CERT"
fi

# ─────────────────────────────────────────────────────────────────
step "7/7 — Enable and start systemd service"

systemctl --user enable agy-usage-proxy.service
systemctl --user restart agy-usage-proxy.service
sleep 1
if systemctl --user is-active agy-usage-proxy.service &>/dev/null; then
  info "Service is active ✅"
else
  err "Service failed to start — check: systemctl --user status agy-usage-proxy.service"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────
step "✅ Done!"

info "Usage log:      $USAGE_LOG"
info "Proxy port:     8080"
info "Fish function:  agy (wraps binary with HTTPS_PROXY)"
info ""
info "Just use 'agy' as normal — token counts are captured automatically."
info "Run 'npm run refresh' in the agentq repo to pull them into the ROI dashboard."
