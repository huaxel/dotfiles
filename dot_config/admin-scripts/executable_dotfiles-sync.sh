#!/bin/bash
set -e

echo "Pulling latest dotfiles from remote..."
git -C ~/.local/share/chezmoi pull

echo "Applying dotfiles..."
chezmoi apply

echo "Adding local changes to repo..."
chezmoi add --all

echo "Committing local changes..."
git -C ~/.local/share/chezmoi commit -am "Auto-sync $(date +"%Y-%m-%d %H:%M:%S")" || echo "No changes to commit."

echo "Pushing changes to remote..."
git -C ~/.local/share/chezmoi push

echo "Sync complete."
