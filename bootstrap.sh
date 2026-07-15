#!/bin/bash
# Bootstrap script for new machines.
# Usage: git clone <repo> ~/dotfiles && cd ~/dotfiles && ./bootstrap.sh
#
# Idempotent — safe to re-run. macOS path is fully automated:
#   Homebrew → dotter + prereqs → deploy dotfiles → brew bundle → macOS defaults
#
# Env toggles:
#   SKIP_BREW_BUNDLE=1   don't install the full Brewfile
#   SKIP_MACOS_DEFAULTS=1 don't apply macOS system defaults

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OS="$(uname -s)"

# ─────────────────────────────────────────────────────────────────
# Helper: fail gracefully instead of crashing
# ─────────────────────────────────────────────────────────────────
warn()  { echo "  ⚠️  $*"; }
info()  { echo "  $*"; }
step()  { echo ""; echo "━━━ $* ━━━"; }

# ─────────────────────────────────────────────────────────────────
# Sudo — ask upfront, keep alive for the whole run.
# brew bundle and macos defaults both need it.
# ─────────────────────────────────────────────────────────────────
if [ "$OS" = "Darwin" ]; then
    sudo -v
    while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done 2>/dev/null &
fi

step "1/8 — Homebrew + core prerequisites"

if [ "$OS" = "Darwin" ]; then
    if ! command -v brew &>/dev/null; then
        info "Installing Homebrew..."
        NONINTERACTIVE=1 /bin/bash -c \
            "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    # Make brew available (Apple Silicon vs Intel).
    if [ -x /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi

    info "Installing core prerequisites (dotter, git, age, sops, mas)..."
    brew install dotter git age sops mas 2>/dev/null || brew install dotter git age sops mas
fi

step "2/8 — Enable git hooks + dotter config"

if [ -d .githooks ]; then
    git config core.hooksPath .githooks
    info "Git hooks enabled from .githooks/"
fi

git config filter.strip-pi-machine-config.smudge \
    'node scripts/strip-pi-machine-config.mjs 2>/dev/null || cat' 2>/dev/null || true

# Create .dotter/local.toml on first run
if [ ! -f .dotter/local.toml ]; then
    case "$OS" in
        Darwin*) dotter_os="macos"; models_base_path="$HOME/.cache/huggingface/hub" ;;
        *)       dotter_os="linux"; models_base_path="/mnt/ai_models/models" ;;
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
models_base_path = "$models_base_path"
EOF
    info "Created .dotter/local.toml for $dotter_os"
fi

step "3/8 — Age key (for secret decryption)"

AGE_KEY="$HOME/.config/sops/age/keys.txt"
if command -v age-keygen &>/dev/null && [ ! -f "$AGE_KEY" ]; then
    echo ""
    echo "   No age key found at $AGE_KEY"
    echo "   If you have an existing key (1Password / backup), restore it there now."
    echo "   Otherwise generating a NEW machine key — note: existing secrets won't"
    echo "   decrypt until you authorize this key in .sops.yaml and rotate them."
    mkdir -p "$(dirname "$AGE_KEY")"
    age-keygen -o "$AGE_KEY"
    echo ""
    echo "   👉 Public key (add to .sops.yaml, then re-encrypt all secrets):"
    age-keygen -y "$AGE_KEY" 2>/dev/null || true
    echo ""
fi

step "4/8 — Link ~/.agents/skills → dotfiles/skills"

AGENTS_DIR="$HOME/.agents"
AGENTS_SKILLS="$AGENTS_DIR/skills"

# If it's a real directory (from a previous rsync-based setup), replace it
if [ ! -L "$AGENTS_SKILLS" ] && [ -d "$AGENTS_SKILLS" ]; then
    info "Replacing ~/.agents/skills with symlink to dotfiles/skills..."
    rm -rf "$AGENTS_SKILLS"
fi

# Create the symlink (parents may not exist on a fresh machine)
if [ ! -e "$AGENTS_SKILLS" ]; then
    mkdir -p "$AGENTS_DIR"
    ln -sfn "$SCRIPT_DIR/skills" "$AGENTS_SKILLS"
    info "Created symlink: ~/.agents/skills → dotfiles/skills"
fi

step "5/8 — Deploy dotfiles"

info "Running: dotter deploy"
dotter deploy

# Linux /etc config (root-owned, needs sudo)
if [ "$OS" = "Linux" ] && [ -x ./etc/install-system-config.sh ]; then
    info "Installing system config (/etc)..."
    sudo ./etc/install-system-config.sh || warn "system config install skipped/failed"
fi

step "6/8 — Install packages"

case "$OS" in
    Darwin)
        BREWFILE="$SCRIPT_DIR/config/Brewfile"
        if [ "${SKIP_BREW_BUNDLE:-0}" = "1" ]; then
            info "SKIP_BREW_BUNDLE=1 — skipping."
        elif [ ! -f "$BREWFILE" ]; then
            warn "Brewfile not found at $BREWFILE"
        else
            # Phase 1: taps + formulae (the bulk of packages)
            info "Installing formulae + casks (this will take a while)..."
            brew bundle --file="$BREWFILE" || \
                warn "Some packages failed — review output above"

            # Phase 2: mas (App Store) — only if signed in
            if mas account &>/dev/null; then
                info "Installing App Store apps..."
                # Filter only mas lines and install them individually so one
                # failure doesn't block the rest
                grep '^mas "' "$BREWFILE" | while IFS= read -r line; do
                    app_name=$(echo "$line" | sed -n 's/^mas "\(.*\)", id: \([0-9]*\)/\1/p')
                    app_id=$(echo "$line" | sed -n 's/^mas "\(.*\)", id: \([0-9]*\)/\2/p')
                    [ -n "$app_name" ] && [ -n "$app_id" ] || continue
                    if ! mas list 2>/dev/null | grep -q "$app_id"; then
                        info "  Installing $app_name..."
                        mas install "$app_id" 2>/dev/null || warn "Failed to install $app_name"
                    fi
                done
            else
                warn "Not signed into the App Store — mas apps skipped."
                warn "  Sign in to App Store.app, then run: brew bundle --file=$BREWFILE"
            fi
        fi
        ;;
    Linux)
        if ! command -v pacman &>/dev/null; then
            warn "No pacman found — install packages manually."
        else
            packages=(
                git neovim nodejs python rust
                starship zoxide atuin fzf
                eza bat fd ripgrep procs dust duf btop bottom fastfetch yazi
                github-cli jq glow lazygit uv just opencode pnpm
                age gnupg sops
                make curl wget tree htop
            )
            extra=($(pacman -Qi git-lfs &>/dev/null || echo "git-lfs"))
            extra+=($(pacman -Qi usage &>/dev/null || echo "usage"))

            missing=()
            for pkg in "${packages[@]}" "${extra[@]}"; do
                pacman -Qi "$pkg" &>/dev/null || missing+=("$pkg")
            done

            if [ ${#missing[@]} -gt 0 ]; then
                info "Installing: ${missing[*]}"
                sudo pacman -S --noconfirm "${missing[@]}"
            fi

            # AUR
            if command -v paru &>/dev/null || command -v yay &>/dev/null; then
                aur_cmd=$(command -v paru || command -v yay)
                for pkg in viddy llama.cpp pi-coding-agent; do
                    pacman -Qi "$pkg" &>/dev/null || \
                        $aur_cmd -S --noconfirm "$pkg" 2>/dev/null || \
                        warn "Failed to install AUR package: $pkg"
                done
            fi
        fi
        ;;
esac

step "7/8 — macOS system defaults"

if [ "$OS" = "Darwin" ] && [ "${SKIP_MACOS_DEFAULTS:-0}" != "1" ] && [ -x ./macos/defaults.sh ]; then
    ./macos/defaults.sh || warn "macOS defaults step had issues"
fi

step "8/8 — Post-install setup"

# Install mise tool versions (if mise was just installed)
if command -v mise &>/dev/null && [ -f "$HOME/.config/mise/config.toml" ]; then
    info "Installing mise tool versions (node, python, go, rust)..."
    mise install 2>/dev/null || warn "mise install had issues — run 'mise install' manually"
fi

# Sync Ghostty theme (if pi is available)
if command -v pi &>/dev/null; then
    info "Syncing Ghostty theme..."
    pi ghostty theme sync 2>/dev/null || true
fi

# Install CLI extras (npm/pnpm/uv global packages)
if [ -x "$SCRIPT_DIR/scripts/install-cli-extras.sh" ]; then
    info "Installing CLI extras (npm/pnpm/uv)..."
    "$SCRIPT_DIR/scripts/install-cli-extras.sh" || warn "Some CLI extras failed — run manually: scripts/install-cli-extras.sh"
fi

# ─────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Dotfiles deployed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo "    1. Restart your shell (or log out/in for defaults to apply)"
echo "    2. Sign into the App Store to install mas apps:"
echo "         brew bundle --file=$SCRIPT_DIR/config/Brewfile"
echo "    3. If secrets didn't decrypt: add this machine's age key to"
echo "       .sops.yaml, re-encrypt secrets, then run: dotter deploy"
echo ""
echo "  🔑 Manual restore (copy from old machine if not done):"
echo "     ~/.config/sops/age/keys.txt   ← decrypts secrets"
echo "     ~/.ssh/                        ← git + server access"
echo "     ~/.gnupg/                      ← commit signing"
echo ""
