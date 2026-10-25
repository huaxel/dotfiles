#!/usr/bin/env bash
set -euo pipefail

# Fast file search for Walker without Elephant.
# Searches common home directories with fd, lets Walker act as a dmenu,
# then opens the selected file/folder with the default application.

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
  | walker --dmenu --placeholder "Search files" --width 900 --maxheight 650
)

[[ -n "${selection:-}" ]] || exit 0
setsid -f xdg-open "$selection" >/dev/null 2>&1
