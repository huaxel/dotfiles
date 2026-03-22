#!/bin/bash
# Arch Linux-specific setup

echo "Setting up Arch Linux..."

# Install yay if not present
if ! command -v yay &>/dev/null; then
	sudo pacman -S --needed base-devel git
	git clone https://aur.archlinux.org/yay.git /tmp/yay
	cd /tmp/yay && makepkg -si
fi

# Install Sway and related
yay -S --noconfirm \
	sway swaylock swayidle waybar \
	alacritty kitty \
	neovim fish starship eza \
	fzf ripgrep fd bat

# Install rust/cargo if not present
if ! command -v cargo &>/dev/null; then
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
fi

# Enable fish as default shell
if ! grep -q "/usr/bin/fish" /etc/shells; then
	echo "/usr/bin/fish" | sudo tee -a /etc/shells
	sudo chsh -s /usr/bin/fish
fi

echo "Arch Linux setup complete!"
