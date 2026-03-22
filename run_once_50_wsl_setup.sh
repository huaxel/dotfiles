#!/bin/bash
# WSL-specific setup

echo "Setting up WSL..."

# Install WSL utilities
sudo apt install -y wslu

# Install Linux tools
sudo apt install -y \
	fish fzf ripgrep fd-find bat \
	eza tree xclip

# Install NEOFETCH alternative
sudo apt install -y neofetch || true

# Windows clipboard integration for fish
# GPU support check
if command -v nvidia-smi &>/dev/null; then
	echo "NVIDIA GPU detected - consider installing CUDA drivers"
fi

echo "WSL setup complete!"
