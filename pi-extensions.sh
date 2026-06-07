#!/bin/bash
# Install all pi extension packages
# Usage: ./pi-extensions.sh

PACKAGES=(
  # GitHub packages
  "git:github.com/tmustier/pi-extensions"
  "https://github.com/ttttmr/pi-context"

  # npm packages
  "npm:context-mode"
  "npm:pi-autoresearch"
  "npm:pi-context-prune"
  "npm:pi-dynamic-workflows"
  "npm:pi-git-assistant"
  "npm:pi-lsp-extension"
  "npm:pi-observability"
  "npm:pi-review-loop"
  "npm:pi-simplify"
  "npm:pi-speedometer"
  "npm:pi-web-access"
  "npm:@juicesharp/rpiv-ask-user-question"
  "npm:@juicesharp/rpiv-todo"
  "npm:@narumitw/pi-goal"
)

for pkg in "${PACKAGES[@]}"; do
  echo "Installing $pkg..."
  pi install "$pkg" || echo "FAILED: $pkg"
done

echo "Done. Installed ${#PACKAGES[@]} packages."
