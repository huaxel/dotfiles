#!/bin/bash
# Pre-deploy hook: sync skills and extensions
# This runs before dotter deploys

DOTFILES_DIR=$(cd $(dirname "$0")/.. && pwd)

# Sync skills from dotfiles to live location
if [ -d "$DOTFILES_DIR/skills" ]; then
    mkdir -p ~/.agents/skills
    cp -r "$DOTFILES_DIR/skills/"* ~/.agents/skills/
fi

# Sync extensions from dotfiles to live location
if [ -d "$DOTFILES_DIR/pi_extensions" ]; then
    mkdir -p ~/.pi/agent/extensions
    cp -r "$DOTFILES_DIR/pi_extensions/"* ~/.pi/agent/extensions/
fi
