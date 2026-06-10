: << 'CMDBLOCK'
@echo off
REM Polyglot wrapper: runs on Windows (CMD) and Unix (bash)
cd /d "%~dp0"
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%~f0"
    exit /b %ERRORLEVEL%
)
echo Error: bash not found in PATH >&2
exit /b 1
CMDBLOCK
#!/bin/bash
# Post-deploy hook: decrypt secrets with sops
# This runs after dotter deploys files

DOTFILES_DIR=$(cd $(dirname "$0")/.. && pwd)
SECRETS_DIR="$DOTFILES_DIR/secrets"
DECRYPT_DIR="$HOME/.config/secrets"

# Check if sops and age are available
if ! command -v sops &>/dev/null || ! command -v age &>/dev/null; then
  echo "⚠️  sops or age not installed — skipping secret decryption"
  echo "   Install: pacman -S sops age  (Arch) or brew install sops age  (macOS)"
  exit 0
fi

# Check if age key exists
if [ ! -f "$HOME/.config/sops/age/keys.txt" ]; then
  echo "⚠️  Age key not found at ~/.config/sops/age/keys.txt"
  echo "   Generate one with: age-keygen -o ~/.config/sops/age/keys.txt"
  exit 0
fi

# Decrypt secrets
if [ -d "$SECRETS_DIR" ]; then
  mkdir -p "$DECRYPT_DIR"

  for enc_file in "$SECRETS_DIR"/*.enc; do
    [ -e "$enc_file" ] || continue

    filename=$(basename "$enc_file" .enc)
    decrypt_path="$DECRYPT_DIR/$filename"

    echo "🔐 Decrypting $filename..."
    if sops --decrypt --output-type binary "$enc_file" >"$decrypt_path" 2>/dev/null; then
      chmod 600 "$decrypt_path"
      echo "   ✅ Decrypted to $decrypt_path"
    else
      echo "   ❌ Failed to decrypt $filename (wrong key or corrupt file)"
    fi
  done
fi

echo ""
echo "💡 To use decrypted secrets in your shell:"
echo "   source ~/.config/secrets/env.fish"

