#!/bin/bash
set -e

echo "Installing chezmoi..."
sh -c "$(curl -fsLS get.chezmoi.io)"

echo "Initializing chezmoi from remote repo..."
chezmoi init --apply huaxel/dotfiles

echo "Dotfiles deployed successfully."
