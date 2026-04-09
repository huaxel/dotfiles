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

# Deploy dotfiles
echo "Deploying dotfiles..."
dotter deploy

echo "✅ Dotfiles deployed successfully!"
echo ""
echo "Next steps:"
echo "  - Restart your shell or run: source ~/.zshrc"
echo "  - Install your package manager packages (brew, pacman, etc.)"
