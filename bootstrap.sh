#!/bin/bash
set -e

# Bootstrap script for new machines
# Run this after cloning the dotfiles repo

echo "🚀 Setting up dotfiles with dotter..."

# Check if dotter is installed
if ! command -v dotter &> /dev/null; then
    echo "Installing dotter..."
    if command -v cargo &> /dev/null; then
        cargo install dotter
    else
        echo "Rust not found. Install from: https://github.com/SuperCuber/dotter/releases"
        exit 1
    fi
fi

# Create machine-local Dotter config on fresh clones
if [ ! -f .dotter/local.toml ]; then
    case "$(uname -s)" in
        Darwin*) dotter_os="macos" ;;
        *) dotter_os="linux" ;;
    esac

    git_name=$(git config --global user.name 2>/dev/null || printf '%s' "${USER:-Your Name}")
    git_email=$(git config --global user.email 2>/dev/null || printf '%s' "your@email.com")

    cat > .dotter/local.toml <<EOF
packages = ["default", "unix"]

[variables]
os = "$dotter_os"
name = "$git_name"
email = "$git_email"
hostname_color = "fg:#f7768e"
EOF
    echo "Created .dotter/local.toml for $dotter_os"
fi

# Deploy dotfiles
echo "Deploying dotfiles..."
dotter deploy

# Install tracked system config (/etc/*) — root-owned, so outside dotter's
# scope. Skipped automatically on non-Linux. Uses sudo; safe to re-run.
if [ "$(uname -s)" = "Linux" ] && [ -x ./etc/install-system-config.sh ]; then
    echo "Installing system config (/etc) — may prompt for sudo..."
    ./etc/install-system-config.sh || echo "⚠️  system config install skipped/failed"
fi

echo "✅ Dotfiles deployed successfully!"
echo ""
echo "Next steps:"
echo "  - Restart your shell or run: source ~/.zshrc"
echo "  - Install your package manager packages (brew, pacman, etc.)"
