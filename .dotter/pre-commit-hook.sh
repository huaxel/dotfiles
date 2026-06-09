#!/bin/bash
# Pre-commit hook for auto-encrypting secrets
# Place this in ~/dotfiles/.git/hooks/pre-commit

DOTFILES_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SECRETS_DIR="$DOTFILES_DIR/secrets"
LIVE_SECRETS="$HOME/.config/secrets"

# Check if env.fish exists and is newer than the encrypted version
if [ -f "$LIVE_SECRETS/env.fish" ]; then
    if [ ! -f "$SECRETS_DIR/env.fish.enc" ] || [ "$LIVE_SECRETS/env.fish" -nt "$SECRETS_DIR/env.fish.enc" ]; then
        echo "🔐 Auto-encrypting secrets from $LIVE_SECRETS/env.fish..."
        if sops --encrypt --input-type binary "$LIVE_SECRETS/env.fish" > "$SECRETS_DIR/env.fish.enc"; then
            git add "$SECRETS_DIR/env.fish.enc"
            echo "   ✅ Secrets auto-encrypted and added to commit"
        else
            echo "   ❌ Failed to encrypt secrets. Aborting commit."
            exit 1
        fi
    fi
fi

# Check if env.sh exists (legacy, warn if found)
if [ -f "$LIVE_SECRETS/env.sh" ]; then
    echo "⚠️  Warning: $LIVE_SECRETS/env.sh exists but is deprecated. Use env.fish instead."
fi

exit 0
