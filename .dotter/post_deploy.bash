#!/usr/bin/env bash
# Post-deploy hook: decrypt secrets with sops
# This runs after dotter deploys files

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SECRETS_DIR="$DOTFILES_DIR/secrets"
DECRYPT_DIR="$HOME/.config/secrets"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$DOTFILES_DIR/pi/agent}"
DEFAULT_PI_AGENT_DIR="$HOME/.pi/agent"

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
      pi-quota-sessions.json) continue ;;
      environment.d) continue ;;
    esac

    decrypt_path="$DECRYPT_DIR/$filename"

    echo "🔐 Decrypting $filename..."
    decrypt_err="$(sops --decrypt --output-type binary "$enc_file" 2>&1 >"$decrypt_path")" || {
      echo "   ❌ Failed to decrypt $filename"
      echo "      $decrypt_err" | head -5
      echo "      (age key: $HOME/.config/sops/age/keys.txt)"
      continue
    }
    chmod 600 "$decrypt_path"
    echo "   ✅ Decrypted to $decrypt_path"
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
    decrypt_err="$(sops --decrypt --output-type binary "$enc" 2>&1 >"$tmp")" || {
      rm -f "$tmp"
      echo "❌ Failed to decrypt $name"
      echo "   $decrypt_err" | head -5
      echo "   (age key: $HOME/.config/sops/age/keys.txt)"
      return 0
    }
    mv "$tmp" "$dest"
    chmod 600 "$dest"
    echo "🔐 Decrypted $name -> $dest"
  }

  # App-specific secrets: decrypt to their real config path.
  # (enc basename -> destination; mirrors post_deploy.ps1 on Windows)
  app_secret "llama-webui-config.json" "$HOME/.config/llama.cpp/webui-config.json"
  # auth.json is intentionally NOT synced/decrypted: OAuth refresh tokens rotate
  # per refresh, so a shared credential desyncs across machines. Each machine
  # owns its own gitignored pi/agent/auth.json and logs in via `/login openai-codex`.
  app_secret "pi-quota-sessions.json" "$PI_AGENT_DIR/quota-sessions.json"
  app_secret "environment.d" "$HOME/.config/environment.d/99-environment.conf"

  if [ -f "$PI_AGENT_DIR/auth.json" ] && [ "$PI_AGENT_DIR/auth.json" != "$DEFAULT_PI_AGENT_DIR/auth.json" ]; then
    mkdir -p "$DEFAULT_PI_AGENT_DIR"
    ln -sfn "$PI_AGENT_DIR/auth.json" "$DEFAULT_PI_AGENT_DIR/auth.json" 2>/dev/null || cp -f "$PI_AGENT_DIR/auth.json" "$DEFAULT_PI_AGENT_DIR/auth.json"
  fi

fi

echo ""
echo "💡 Secrets are loaded by systemd environment.d for all shells:"
echo "   ~/.config/environment.d/99-environment.conf  (decrypted above)"
echo "   Log out/in (or start a new session) so systemd applies the keys."
