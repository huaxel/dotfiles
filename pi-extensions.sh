#!/bin/bash
# Install all pi extension packages
# Usage: ./pi-extensions.sh

PACKAGES=(
  # GitHub packages (with exclusions configured manually in settings.json)
  # NOTE: tmustier/pi-extensions has arcade games excluded:
  #   -arcade/picman.ts, -arcade/ping.ts, -arcade/spice-invaders.ts, -arcade/tetris.ts
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

echo ""
echo "Done. Installed ${#PACKAGES[@]} packages."
echo ""
echo "IMPORTANT: After installing, manually configure the tmustier extension"
echo "exclusions in ~/.pi/agent/settings.json to exclude arcade games:"
echo '  "extensions": ["-arcade/picman.ts", "-arcade/ping.ts", "-arcade/spice-invaders.ts", "-arcade/tetris.ts"]'

