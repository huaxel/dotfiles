#!/usr/bin/env bash
set -euo pipefail

# Fast file search with Noctalia dmenu (no Walker/Elephant needed).
# Searches common home directories with fd, lets Noctalia act as a dmenu,
# then opens the selected file/folder with the default application.

NOCTALIA=/home/juan/.nix-profile/bin/noctalia

search_roots=(
  "$HOME/Desktop"
  "$HOME/Documents"
  "$HOME/Downloads"
  "$HOME/Pictures"
  "$HOME/Projects"
  "$HOME/Code"
  "$HOME/dotfiles"
  "$HOME"
)

existing_roots=()
for dir in "${search_roots[@]}"; do
  [[ -d "$dir" ]] && existing_roots+=("$dir")
done

selection=$(
  fd . "${existing_roots[@]}" \
    --absolute-path \
    --follow \
    --max-depth 6 \
    --exclude .git \
    --exclude node_modules \
    --exclude .cache \
    --exclude .local/share/Trash \
    --exclude target \
    --exclude dist \
    --exclude build \
  | "$NOCTALIA" dmenu -p "Search files"
)

[[ -n "${selection:-}" ]] || exit 0
setsid -f xdg-open "$selection" >/dev/null 2>&1
