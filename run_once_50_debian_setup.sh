#!/bin/bash
# Debian/Raspberry Pi specific setup

echo "Setting up Debian/Raspberry Pi..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install core packages
sudo apt install -y \
	git curl wget build-essential \
	fish fzf ripgrep fd-find bat \
	eza python3-pip vim xclip \
	libnotify-bin libdbus-1-dev libssl-dev \
	libxcb1-dev libxcb-render0-dev libxcb-shape0-dev \
	libxcb-xfixes0-dev libxkbcommon-dev libpixman-1-dev \
	libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Install neovim (newer version)
if ! command -v nvim &>/dev/null; then
	sudo apt install -y neovim || true
fi

# Install Rust
if ! command -v cargo &>/dev/null; then
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
fi

# Install starship
if ! command -v starship &>/dev/null; then
	curl -sS https://starship.rs/install.sh | sh
fi

# Enable fish shell
if ! grep -q "/usr/bin/fish" /etc/shells; then
	echo "/usr/bin/fish" | sudo tee -a /etc/shells
	chsh -s /usr/bin/fish
fi

echo "Debian/Raspberry Pi setup complete!"
