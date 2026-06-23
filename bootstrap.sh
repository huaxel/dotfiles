#!/bin/bash
set -e

# Bootstrap script for new machines
# Run this after cloning the dotfiles repo

echo "🚀 Setting up dotfiles with dotter..."

# Check if dotter is installed
if ! command -v dotter &> /dev/null; then
    echo "Installing dotter..."
    if command -v cargo &> /dev/null; then
        cargo install dotter
    else
        echo "Rust not found. Install from: https://github.com/SuperCuber/dotter/releases"
        exit 1
    fi
fi

# Enable tracked git hooks (auto-encrypt secrets, etc.)
if [ -d .githooks ]; then
    git config core.hooksPath .githooks
    echo "🔗 Git hooks enabled from .githooks/"
fi

# Create machine-local Dotter config on fresh clones
if [ ! -f .dotter/local.toml ]; then
    case "$(uname -s)" in
        Darwin*) dotter_os="macos" ;;
        *) dotter_os="linux" ;;
    esac

    git_name=$(git config --global user.name 2>/dev/null || printf '%s' "${USER:-Your Name}")
    git_email=$(git config --global user.email 2>/dev/null || printf '%s' "your@email.com")

    cat > .dotter/local.toml <<EOF
packages = ["default", "unix"]

[variables]
os = "$dotter_os"
name = "$git_name"
email = "$git_email"
hostname_color = "fg:#f7768e"
EOF
    echo "Created .dotter/local.toml for $dotter_os"
fi

# Deploy dotfiles
echo "Deploying dotfiles..."
dotter deploy

# Install tracked system config (/etc/*) — root-owned, so outside dotter's
# scope. Skipped automatically on non-Linux. Uses sudo; safe to re-run.
if [ "$(uname -s)" = "Linux" ] && [ -x ./etc/install-system-config.sh ]; then
    echo "Installing system config (/etc) — may prompt for sudo..."
    ./etc/install-system-config.sh || echo "⚠️  system config install skipped/failed"
fi

# Install packages based on platform
echo ""
echo "📦 Installing platform packages..."
case "$(uname -s)" in
    Darwin)
        if command -v brew &> /dev/null; then
            echo "Run: brew bundle --file=~/.config/Brewfile"
        else
            echo "Homebrew not found. Install: https://brew.sh"
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
                eza bat fd ripgrep procs dust duf btop bottom fastfetch viddy
                # Dev tools
                gh jq glow lazygit uv just
                # Encryption
                age gnupg sops
                # Build
                make
                # Utilities
                curl wget tree htop
            )

            # AUR packages (via paru or yay)
            aur_packages=(
                opencode pi-coding-agent
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

echo "✅ Dotfiles deployed successfully!"
echo ""
echo "Next steps:"
echo "  - Restart your shell"
