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
  mkdir -p "$target_dir"

  # Dotter deploys these trees as symlinks on Unix. If a target file already
  # resolves to the source file, copying would try to copy a file onto itself.
  local sample rel target_sample
  sample=$(find "$source_dir" -type f -print -quit)
  if [ -n "$sample" ]; then
    rel=${sample#"$source_dir"/}
    target_sample="$target_dir/$rel"
    if [ -e "$target_sample" ] && [ "$sample" -ef "$target_sample" ]; then
      echo "✓ $label already linked by Dotter; skipping pre-deploy copy"
      return 0
    fi
  fi

  cp -R "$source_dir"/. "$target_dir"/
}

sync_dir "$DOTFILES_DIR/skills" "$HOME/.agents/skills" "skills"
sync_dir "$DOTFILES_DIR/pi_extensions" "$HOME/.pi/agent/extensions" "pi extensions"
