#!/usr/bin/env bash
# Post-deploy hook: decrypt secrets with sops
# This runs after dotter deploys files

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
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

    # App-specific secrets decrypt to their real config path below, not the
    # generic ~/.config/secrets/ dir — skip them here.
    case "$filename" in
      llama-webui-config.json) continue ;;
    esac

    decrypt_path="$DECRYPT_DIR/$filename"

    echo "🔐 Decrypting $filename..."
    if sops --decrypt --output-type binary "$enc_file" >"$decrypt_path" 2>/dev/null; then
      chmod 600 "$decrypt_path"
      echo "   ✅ Decrypted to $decrypt_path"
    else
      echo "   ❌ Failed to decrypt $filename (wrong key or corrupt file)"
    fi
  done

  # App-specific secrets: decrypt to their real config path.
  # Map of "<enc-basename-without-.enc>" -> "<destination path>".
  app_secret() {
    local name="$1" dest="$2"
    local enc="$SECRETS_DIR/$name.enc"
    [ -f "$enc" ] || return 0
    mkdir -p "$(dirname "$dest")"
    # Decrypt to a temp file first so a failed decrypt never truncates the
    # existing destination (which would clobber a good secret with an empty file).
    local tmp
    tmp="$(mktemp)"
    if sops --decrypt --output-type binary "$enc" >"$tmp" 2>/dev/null; then
      mv "$tmp" "$dest"
      chmod 600 "$dest"
      echo "🔐 Decrypted $name -> $dest"
    else
      rm -f "$tmp"
      echo "❌ Failed to decrypt $name (wrong key or corrupt file)"
    fi
  }

  # App-specific secrets: decrypt to their real config path.
  # (enc basename -> destination; mirrors post_deploy.ps1 on Windows)
  app_secret "llama-webui-config.json" "$HOME/.config/llama.cpp/webui-config.json"
  app_secret "pi-auth.json" "$HOME/dotfiles/pi/agent/auth.json"

fi

echo ""
echo "💡 To use decrypted secrets in your shell:"
echo "   source ~/.config/secrets/env.fish"
