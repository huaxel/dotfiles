#!/bin/bash
set -e

# Bootstrap script for new machines.
# Usage: git clone <repo> ~/dotfiles && cd ~/dotfiles && ./bootstrap.sh
#
# Idempotent — safe to re-run. macOS path is fully automated:
#   Homebrew → dotter + prereqs → deploy dotfiles → brew bundle → macOS defaults
#
# Env toggles:
#   SKIP_BREW_BUNDLE=1   don't install the full Brewfile
#   SKIP_MACOS_DEFAULTS=1 don't apply macOS system defaults

echo "🚀 Setting up dotfiles with dotter..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OS="$(uname -s)"

# ---------------------------------------------------------------------------
# Step 0 (macOS): Homebrew + core prerequisites
# A fresh Mac has no brew, no dotter, no sops/age. Bootstrap them here so the
# rest of the script (deploy, secret decryption, brew bundle) just works.
# ---------------------------------------------------------------------------
if [ "$OS" = "Darwin" ]; then
    if ! command -v brew &>/dev/null; then
        echo "🍺 Installing Homebrew..."
        NONINTERACTIVE=1 /bin/bash -c \
            "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    # Make brew available in this shell session (Apple Silicon vs Intel paths).
    if [ -x /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi

    echo "📥 Installing core prerequisites (dotter, git, age, sops, mas)..."
    brew install dotter git age sops mas 2>/dev/null || \
        brew install dotter git age sops mas
fi

# ---------------------------------------------------------------------------
# Step 1: Ensure dotter exists (non-macOS fallbacks)
# ---------------------------------------------------------------------------
if ! command -v dotter &>/dev/null; then
    echo "Installing dotter..."
    if command -v cargo &>/dev/null; then
        cargo install dotter
    else
        echo "Rust not found. Install dotter from:"
        echo "  https://github.com/SuperCuber/dotter/releases"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Step 2: Enable tracked git hooks (auto-encrypt secrets, etc.)
# ---------------------------------------------------------------------------
if [ -d .githooks ]; then
    git config core.hooksPath .githooks
    echo "🔗 Git hooks enabled from .githooks/"
fi

# Make the pi_settings smudge filter resilient: if its helper script isn't
# present yet (e.g. fresh worktree checkout), pass content through unchanged
# instead of aborting the checkout.
git config filter.strip-pi-machine-config.smudge \
    'node scripts/strip-pi-machine-config.mjs 2>/dev/null || cat' 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 3: Create machine-local Dotter config on fresh clones
# ---------------------------------------------------------------------------
if [ ! -f .dotter/local.toml ]; then
    case "$OS" in
        Darwin*) dotter_os="macos"; models_base_path="$HOME/.cache/huggingface/hub" ;;
        *)       dotter_os="linux"; models_base_path="/mnt/ai_models/models" ;;
    esac

    git_name=$(git config --global user.name 2>/dev/null || printf '%s' "${USER:-Your Name}")
    git_email=$(git config --global user.email 2>/dev/null || printf '%s' "your@email.com")

    # models_base_path is required by the llama-models.ini template; without it
    # `dotter deploy` renders a broken llama.cpp config.
    cat > .dotter/local.toml <<EOF
packages = ["default", "unix"]

[variables]
os = "$dotter_os"
name = "$git_name"
email = "$git_email"
hostname_color = "fg:#f7768e"
models_base_path = "$models_base_path"
EOF
    echo "Created .dotter/local.toml for $dotter_os"
fi

# ---------------------------------------------------------------------------
# Step 4: Secrets — ensure an age key exists before deploy decrypts secrets
# ---------------------------------------------------------------------------
AGE_KEY="$HOME/.config/sops/age/keys.txt"
if command -v age-keygen &>/dev/null && [ ! -f "$AGE_KEY" ]; then
    echo ""
    echo "🔑 No age key found at $AGE_KEY"
    echo "   If you have an existing key (1Password / backup), restore it there now."
    echo "   Otherwise generating a NEW machine key — note: existing secrets won't"
    echo "   decrypt until you authorize this key in .sops.yaml and rotate them."
    mkdir -p "$(dirname "$AGE_KEY")"
    age-keygen -o "$AGE_KEY"
    echo ""
    echo "   👉 Public key (add to .sops.yaml, then re-encrypt secrets):"
    age-keygen -y "$AGE_KEY" 2>/dev/null || true
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 5: Deploy dotfiles (renders templates, creates symlinks, decrypts secrets)
# ---------------------------------------------------------------------------
echo "Deploying dotfiles..."
dotter deploy

# Install tracked system config (/etc/*) — root-owned, so outside dotter's
# scope. Skipped automatically on non-Linux. Uses sudo; safe to re-run.
if [ "$OS" = "Linux" ] && [ -x ./etc/install-system-config.sh ]; then
    echo "Installing system config (/etc) — may prompt for sudo..."
    ./etc/install-system-config.sh || echo "⚠️  system config install skipped/failed"
fi

# ---------------------------------------------------------------------------
# Step 6: Install platform packages
# ---------------------------------------------------------------------------
echo ""
echo "📦 Installing platform packages..."
case "$OS" in
    Darwin)
        BREWFILE="$SCRIPT_DIR/config/Brewfile"
        if [ "${SKIP_BREW_BUNDLE:-0}" = "1" ]; then
            echo "⏭️  SKIP_BREW_BUNDLE=1 — skipping brew bundle."
        elif [ -f "$BREWFILE" ]; then
            if ! mas account &>/dev/null; then
                echo "⚠️  Not signed into the App Store — 'mas' apps will fail."
                echo "   Sign in via App Store.app, then re-run, or ignore those lines."
            fi
            echo "Running brew bundle (this can take a while)..."
            brew bundle --file="$BREWFILE" || \
                echo "⚠️  brew bundle finished with some failures (often just mas/login). Review above."
        else
            echo "Brewfile not found at $BREWFILE"
        fi
        ;;
    Linux)
        if command -v pacman &> /dev/null; then
            # Arch Linux packages — mirrors Brewfile/Scoop tool set
            packages=(
                # Core tools
                git neovim nodejs python rust
                # Shell & prompt
                starship zoxide atuin fzf
                # Modern CLI replacements
                eza bat fd ripgrep procs dust duf btop bottom fastfetch yazi
                # Dev tools
                github-cli jq glow lazygit uv just opencode pnpm
                # Encryption
                age gnupg sops
                # Build
                make
                # Utilities
                curl wget tree htop
            )

            # AUR packages (via paru or yay)
            aur_packages=(
                viddy llama.cpp pi-coding-agent
            )

            # Install official packages
            missing=()
            for pkg in "${packages[@]}"; do
                if ! pacman -Qi "$pkg" &> /dev/null; then
                    missing+=("$pkg")
                fi
            done

            if [ ${#missing[@]} -gt 0 ]; then
                echo "Installing: ${missing[*]}"
                sudo pacman -S --noconfirm "${missing[@]}"
            else
                echo "✅ All pacman packages installed"
            fi

            # Install AUR packages
            if command -v paru &> /dev/null || command -v yay &> /dev/null; then
                aur_cmd=$(command -v paru || command -v yay)
                aur_missing=()
                for pkg in "${aur_packages[@]}"; do
                    if ! pacman -Qi "$pkg" &> /dev/null; then
                        aur_missing+=("$pkg")
                    fi
                done
                if [ ${#aur_missing[@]} -gt 0 ]; then
                    echo "Installing AUR: ${aur_missing[*]}"
                    $aur_cmd -S --noconfirm "${aur_missing[@]}"
                fi
            else
                echo "⚠️  No AUR helper found. Install paru or yay for AUR packages."
            fi
        else
            echo "Package manager not detected. Install packages manually."
        fi
        ;;
esac

# ---------------------------------------------------------------------------
# Step 7 (macOS): Apply system defaults
# ---------------------------------------------------------------------------
if [ "$OS" = "Darwin" ] && [ "${SKIP_MACOS_DEFAULTS:-0}" != "1" ] && [ -x ./macos/defaults.sh ]; then
    echo ""
    echo "⚙️  Applying macOS system defaults (may prompt for sudo)..."
    ./macos/defaults.sh || echo "⚠️  macOS defaults step had issues — review above."
fi

echo ""
echo "✅ Dotfiles deployed successfully!"
echo ""
echo "Next steps:"
echo "  - Restart your shell (or log out/in for macOS defaults to fully apply)"
echo "  - Sign into the App Store and re-run if 'mas' apps were skipped"
echo "  - If secrets didn't decrypt: authorize this machine's age key in .sops.yaml,"
echo "    rotate secrets, then run: dotter deploy"
