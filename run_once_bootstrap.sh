#!/bin/bash
# Cross-platform bootstrap script for dotfiles
# Usage: curl -fsSL https://raw.githubusercontent.com/huaxel/dotfiles/main/bootstrap.sh | bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

detect_os() {
	case "$OSTYPE" in
		darwin*)
			echo "macos" ;;
		linux-gnu*)
			if [[ -f /proc/version ]] && grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
				echo "wsl"
			elif [[ -f /etc/os-release ]] && grep -qE "arch|manjaro" /etc/os-release; then
				echo "arch"
			elif [[ -f /etc/os-release ]] && grep -qE "debian|ubuntu|raspbian" /etc/os-release; then
				echo "debian"
			else
				echo "linux"
			fi
			;;
		*)
			echo "unknown" ;;
	esac
}

install_chezmoi() {
	if command -v chezmoi &>/dev/null; then
		log_info "chezmoi already installed"
		return 0
	fi

	log_info "Installing chezmoi..."
	sh -c "$(curl -fsLS get.chezmoi.io)"
	
	# Move to standard location if installed in bin
	if [[ -f "$HOME/bin/chezmoi" ]] && [[ ! -d "$HOME/.local/bin" ]]; then
		mkdir -p "$HOME/.local/bin"
		mv "$HOME/bin/chezmoi" "$HOME/.local/bin/"
		rmdir "$HOME/bin" 2>/dev/null || true
	fi
}

init_dotfiles() {
	local repo_url="https://github.com/huaxel/dotfiles.git"
	
	if [[ -d "$HOME/.local/share/chezmoi/.git" ]]; then
		log_warn "Dotfiles already initialized at ~/.local/share/chezmoi"
		read -p "Do you want to reinitialize? (y/N) " -n 1 -r
		echo
		if [[ ! $REPLY =~ ^[Yy]$ ]]; then
			log_info "Skipping dotfiles initialization"
			return 0
		fi
		mv "$HOME/.local/share/chezmoi" "$HOME/.local/share/chezmoi.backup.$(date +%Y%m%d)"
	fi

	log_info "Initializing dotfiles from $repo_url..."
	chezmoi init --apply "$repo_url"
}

install_packages() {
	local os=$1
	
	case "$os" in
		macos)
			log_info "Setting up macOS..."
			if ! command -v brew &>/dev/null; then
				log_info "Installing Homebrew..."
				/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
				
				# Add to PATH for Apple Silicon
				if [[ -d /opt/homebrew/bin ]]; then
					eval "$(/opt/homebrew/bin/brew shellenv)"
				fi
			fi
			
			log_info "Installing packages from Brewfile..."
			if [[ -f "$HOME/.config/Brewfile" ]]; then
				brew bundle --file="$HOME/.config/Brewfile" || log_warn "Some Brewfile packages failed to install"
			fi
			;;
			
		arch)
			log_info "Setting up Arch Linux..."
			if ! command -v yay &>/dev/null; then
				log_info "Installing yay..."
				sudo pacman -S --needed --noconfirm base-devel git
				git clone https://aur.archlinux.org/yay.git /tmp/yay
				(cd /tmp/yay && makepkg -si --noconfirm)
			fi
			
			# Install packages from the arch setup script
			if [[ -f "$HOME/.local/share/chezmoi/run_once_50_arch_setup.sh" ]]; then
				bash "$HOME/.local/share/chezmoi/run_once_50_arch_setup.sh"
			fi
			;;
			
		debian|wsl|linux)
			log_info "Setting up $os..."
			if [[ -f "$HOME/.local/share/chezmoi/run_once_50_debian_setup.sh" ]]; then
				bash "$HOME/.local/share/chezmoi/run_once_50_debian_setup.sh"
			fi
			;;
			
		*)
			log_warn "Unknown OS: $os. Package installation skipped."
			;;
	esac
}

main() {
	log_info "Starting dotfiles bootstrap..."
	
	local os
	os=$(detect_os)
	log_info "Detected OS: $os"
	
	# Install chezmoi first
	install_chezmoi
	
	# Ensure local bin is in PATH for this session
	export PATH="$HOME/.local/bin:$PATH"
	
	# Initialize dotfiles
	init_dotfiles
	
	# Install OS-specific packages
	install_packages "$os"
	
	# Run all run_once scripts
	log_info "Running setup scripts..."
	chezmoi apply
	
	log_info "Bootstrap complete! 🎉"
	log_info "Please restart your shell or run: source ~/.zshrc (or ~/.config/fish/config.fish)"
}

# Run main function
main "$@"
