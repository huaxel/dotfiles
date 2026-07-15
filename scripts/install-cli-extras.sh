#!/usr/bin/env bash
# Install CLI tools outside Homebrew: npm global, pnpm global, uv tools
# Run after bootstrap.sh (needs node, pnpm, uv installed)

set -euo pipefail

info()  { echo "  $*"; }
warn()  { echo "  ⚠️  $*"; }

echo "━━━ CLI extras (npm/pnpm/uv) ━━━"

# ─────────────────────────────────────────────────────────────
# npm global packages
# ─────────────────────────────────────────────────────────────
if command -v npm &>/dev/null; then
    NPM_PACKAGES=(
        "@sap/cds-dk"
        "@sap/cds-ts"
        "@sap/cds-tsx"
        "@jules-commerce/cli"
        "@anthropic-ai/claude-code"
        "mcp-remote"
        "mcp-remote-client"
        "ccusage"
        "mbt"
    )

    for pkg in "${NPM_PACKAGES[@]}"; do
        name=$(basename "$pkg")
        if command -v "$name" &>/dev/null; then
            info "✅ $pkg already installed"
        else
            info "Installing $pkg..."
            npm install -g "$pkg" 2>/dev/null && info "  ✅ $pkg" || warn "Failed to install $pkg"
        fi
    done
else
    warn "npm not available — skipping npm global packages"
fi

# ─────────────────────────────────────────────────────────────
# pnpm global packages
# ─────────────────────────────────────────────────────────────
if command -v pnpm &>/dev/null; then
    PNPM_PACKAGES=(
        "wrangler"
    )

    for pkg in "${PNPM_PACKAGES[@]}"; do
        name=$(basename "$pkg")
        if pnpm list -g --depth=0 2>/dev/null | grep -q "$pkg"; then
            info "✅ $pkg already installed (pnpm)"
        else
            info "Installing $pkg via pnpm..."
            pnpm add -g "$pkg" 2>/dev/null && info "  ✅ $pkg" || warn "Failed to install $pkg via pnpm"
        fi
    done
else
    warn "pnpm not available — skipping pnpm global packages"
fi

# ─────────────────────────────────────────────────────────────
# uv tools
# ─────────────────────────────────────────────────────────────
if command -v uv &>/dev/null; then
    UV_TOOLS=(
        "osxphotos"
    )

    for tool in "${UV_TOOLS[@]}"; do
        if uv tool list 2>/dev/null | grep -q "$tool"; then
            info "✅ $tool already installed (uv)"
        else
            info "Installing $tool via uv..."
            uv tool install "$tool" 2>/dev/null && info "  ✅ $tool" || warn "Failed to install $tool"
        fi
    done
else
    warn "uv not available — skipping uv tools"
fi

echo "━━━ CLI extras complete ━━━"
