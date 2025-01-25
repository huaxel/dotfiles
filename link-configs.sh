#!/bin/sh

# List of config files and directories
CONFIG_ITEMS="
.bashrc:bash/.bashrc
.viminfo:vim/.viminfo
.ssh:ssh
.vscode:vscode
.rbenv:rbenv
.paleofetch:paleofetch/.paleofetch
juan-uv:juan-uv
.zsh_history:zsh/.zsh_history
"

CONFIG_DIR="$HOME/.config"

for ITEM in $CONFIG_ITEMS; do
  SRC="$(echo $ITEM | cut -d: -f1)"
  DEST="$(echo $ITEM | cut -d: -f2)"
  TARGET="$CONFIG_DIR/$DEST"

  # Create parent directory for target
  mkdir -p "$(dirname "$TARGET")"

  # Move the item and create a symlink
  if [ -e "$HOME/$SRC" ]; then
    mv "$HOME/$SRC" "$TARGET"
  fi
  ln -sf "$TARGET" "$HOME/$SRC"
done

echo "All config files and directories have been moved and linked."
