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

if [ ! -f "$MITM_CERT" ] || [ ! -s "$MITM_CERT" ]; then
  info "Starting mitmdump briefly to generate CA cert..."
  rm -f "$MITM_CERT"  # ensure clean slate
  mitmdump --listen-port 8081 --set block_global=false &
  PID=$!
  # Wait up to 10s for the cert file to appear and be non-empty
  for i in $(seq 1 20); do
    if [ -s "$MITM_CERT" ]; then break; fi
    sleep 0.5
  done
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  if [ -s "$MITM_CERT" ]; then
    info "CA cert generated at $MITM_CERT ($(wc -c < "$MITM_CERT") bytes)"
  else
    warn "mitmdump may not have generated the CA cert."
    warn "It will be auto-created when the service starts."
  fi
else
  info "CA cert already exists at $MITM_CERT"
fi

# ─────────────────────────────────────────────────────────────────
step "6/7 — Trust CA certificate system-wide"

OS="$(uname -s)"

if [ -f "$MITM_CERT" ] && [ -s "$MITM_CERT" ]; then
  info "Adding mitmproxy CA to system trust..."

  if [ "$OS" = "Darwin" ]; then
    # macOS — use security(1) to add to system keychain
    if security find-certificate -c mitmproxy /Library/Keychains/System.keychain &>/dev/null; then
      info "mitmproxy CA already in system keychain"
    else
      info "Adding to macOS system keychain (needs sudo)..."
      if sudo security add-trusted-cert -d -p ssl -r trustRoot \
        -k /Library/Keychains/System.keychain "$MITM_CERT" 2>/dev/null; then
        info "Trusted via system keychain ✅"
      else
        warn "Could not add to system keychain. Try manually:"
        warn "  sudo security add-trusted-cert -d -p ssl -r trustRoot \\"
        warn "    -k /Library/Keychains/System.keychain $MITM_CERT"
      fi
    fi

  elif command -v trust &>/dev/null; then
    # Linux with p11-kit
    if trust list 2>/dev/null | grep -q "mitmproxy"; then
      info "mitmproxy CA already in p11-kit store"
    else
      info "Using p11-kit trust anchor (needs sudo)..."
      TMP_CERT="/tmp/mitmproxy-ca-cert.pem"
      cp "$MITM_CERT" "$TMP_CERT"
      if sudo trust anchor "$TMP_CERT" 2>/dev/null; then
        rm -f "$TMP_CERT"
        # Regenerate PEM bundle for Go
        CA_BUNDLE="/etc/ca-certificates/extracted/tls-ca-bundle.pem"
        if [ -f "$CA_BUNDLE" ]; then
          sudo p11-kit extract --format=pem-bundle --filter=ca-anchors \
            --overwrite --comment "$CA_BUNDLE" 2>/dev/null || true
        fi
        info "Trusted via p11-kit ✅"
      else
        rm -f "$TMP_CERT"
        warn "trust anchor failed — falling back to direct PEM append"
        # Try common Linux CA bundle paths
        for bundle in \
          /etc/ca-certificates/extracted/tls-ca-bundle.pem \
          /etc/ssl/certs/ca-certificates.crt \
          /etc/pki/tls/certs/ca-bundle.crt \
          /etc/ssl/ca-bundle.pem; do
          if [ -f "$bundle" ]; then
            sudo tee -a "$bundle" < "$MITM_CERT" >/dev/null && \
              info "Appended to $bundle ✅"
            break
          fi
        done
      fi
    fi

  else
    # Linux without p11-kit — try direct PEM bundle append
    for bundle in \
      /etc/ca-certificates/extracted/tls-ca-bundle.pem \
      /etc/ssl/certs/ca-certificates.crt \
      /etc/pki/tls/certs/ca-bundle.crt; do
      if [ -f "$bundle" ]; then
        if grep -q "mitmproxy" "$bundle" 2>/dev/null; then
          info "mitmproxy CA already in $bundle"
        else
          info "Appending to $bundle (needs sudo)..."
          sudo tee -a "$bundle" < "$MITM_CERT" >/dev/null && \
            info "Appended to $bundle ✅"
        fi
        break
      fi
    done
  fi
else
  warn "CA cert not available — will be generated on first proxy start."
  warn "Run the setup again after the first proxy run to trust it."
fi

# ─────────────────────────────────────────────────────────────────
step "7/7 — Enable background service"

if command -v systemctl &>/dev/null; then
  # Linux — systemd user service
  systemctl --user enable agy-usage-proxy.service
  systemctl --user restart agy-usage-proxy.service
  sleep 1
  if systemctl --user is-active agy-usage-proxy.service &>/dev/null; then
    info "systemd service is active ✅"
  else
    err "Service failed to start — check: systemctl --user status agy-usage-proxy.service"
    exit 1
  fi
elif [ "$OS" = "Darwin" ]; then
  # macOS — launchd agent via .plist
  PLIST="$HOME/Library/LaunchAgents/com.mitmproxy.agy-usage.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mitmproxy.agy-usage</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(command -v mitmdump)</string>
        <string>--listen-port</string>
        <string>8080</string>
        <string>--set</string>
        <string>block_global=false</string>
        <string>-s</string>
        <string>$ADDON_DST</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>3</integer>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/mitmproxy-agy-usage.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/mitmproxy-agy-usage.log</string>
</dict>
</plist>
EOF
  launchctl load "$PLIST" 2>/dev/null || true
  sleep 1
  if launchctl list | grep -q "com.mitmproxy.agy-usage"; then
    info "launchd agent loaded ✅"
  else
    warn "launchd agent may not have started. Check:"
    warn "  launchctl list | grep mitmproxy"
  fi
else
  warn "No service manager found. Start the proxy manually when using agy:"
  warn "  mitmdump --listen-port 8080 --set block_global=false -s $ADDON_DST"
fi

# ─────────────────────────────────────────────────────────────────
step "✅ Done!"

info "Usage log:      $USAGE_LOG"
info "Proxy port:     8080"
info "Fish function:  agy (wraps binary with HTTPS_PROXY)"
info ""
info "Just use 'agy' as normal — token counts are captured automatically."
info "Run 'npm run refresh' in the agentq repo to pull them into the ROI dashboard."
