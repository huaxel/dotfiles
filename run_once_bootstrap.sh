#!/bin/bash
# Cross-platform bootstrap script for dotfiles
set -e

detect_os() {
	if [[ "$OSTYPE" == "darwin"* ]]; then
		echo "macos"
	elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
		if grep -q "Microsoft" /proc/version 2>/dev/null || grep -q "WSL" /proc/version 2>/dev/null; then
			echo "wsl"
		elif grep -qE "arch|manjaro" /etc/os-release 2>/dev/null; then
			echo "arch"
		elif grep -qE "raspbian|debian" /etc/os-release 2>/dev/null; then
			echo "debian"
		else
			echo "linux"
		fi
	else
		echo "unknown"
	fi
}

OS=$(detect_os)
echo "Detected OS: $OS"

install_macos() {
	echo "Installing macOS packages..."

	# Install Homebrew if not present
	if ! command -v brew &>/dev/null; then
		/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
	fi

	# Core packages from Brewfile
	brew bundle --file="$HOME/.config/Brewfile"

	# Mac-specific setup
	brew install --cask aerospace ghostty sketchybar || true
}

install_linux_common() {
	echo "Installing Linux common packages..."

	# Essential tools
	sudo apt-get update
	sudo apt-get install -y \
		git curl wget build-essential \
		fish fzf ripgrep fd-find \
		bat eza || sudo apt-get install -y eza || true
}

install_wsl() {
	echo "Installing WSL-specific packages..."

	install_linux_common

	# Windows-specific
	sudo apt-get install -y wslu || true

	# GPU support if available
	if command -v nvidia-smi &>/dev/null; then
		echo "NVIDIA detected"
	fi
}

install_arch() {
	echo "Installing Arch Linux packages..."

	# Install yay if not present
	if ! command -v yay &>/dev/null; then
		sudo pacman -S --needed base-devel git
		git clone https://aur.archlinux.org/yay.git /tmp/yay
		cd /tmp/yay && makepkg -si
	fi

	# Core packages
	yay -S --noconfirm \
		neovim git fish starship eza \
		fzf ripgrep fd bat sway waybar \
		alacritty kitty ghostty || true
}

install_debian() {
	echo "Installing Debian/Raspberry Pi packages..."

	install_linux_common

	# Additional for ARM/Raspberry Pi
	sudo apt-get install -y \
		python3-pip vim xclip || true
}

install_common() {
	echo "Installing common packages..."

	# chezmoi (if not installed)
	if ! command -v chezmoi &>/dev/null; then
		sh -c "$(curl -fsSL https://get.chezmoi.io/sh)"
	fi

	# Clone dotfiles
	if [ ! -d "$HOME/.local/share/chezmoi" ]; then
		git clone https://github.com/huaxel/dotfiles.git "$HOME/.local/share/chezmoi"
	fi

	# Apply dotfiles
	chezmoi apply --force
}

# Main
case $OS in
macos)
	install_macos
	;;
wsl)
	install_wsl
	;;
arch)
	install_arch
	;;
debian)
	install_debian
	;;
linux)
	install_linux_common
	;;
*)
	echo "Unknown OS: $OS"
	exit 1
	;;
esac

install_common

echo "Bootstrap complete!"
