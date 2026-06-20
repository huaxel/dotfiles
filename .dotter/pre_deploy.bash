#!/usr/bin/env bash
# Pre-deploy hook: sync skills and extensions
# This runs before dotter deploys

set -euo pipefail

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

sync_dir() {
  local source_dir=$1
  local target_dir=$2
  local label=$3

  [ -d "$source_dir" ] || return 0

  # If Dotter (or a previous setup) already linked the whole tree, copying would
  # copy files onto themselves. Check the directory itself, not a single sample
  # file, because the target can be partially populated.
  if [ -e "$target_dir" ] && [ "$source_dir" -ef "$target_dir" ]; then
    echo "✓ $label already linked by Dotter; skipping pre-deploy copy"
    return 0
  fi

  mkdir -p "$target_dir"

  # Use rsync instead of cp -R: macOS cp fails when an existing destination file
  # is a symlink back into this repo ("Permission denied"). rsync replaces those
  # per-file symlinks with normal files while preserving unrelated target files.
  rsync -a "$source_dir"/ "$target_dir"/
  echo "✓ $label synced to $target_dir"
}

sync_dir "$DOTFILES_DIR/skills" "$HOME/.agents/skills" "skills"
sync_dir "$DOTFILES_DIR/pi_extensions" "$HOME/.pi/agent/extensions" "pi extensions"
