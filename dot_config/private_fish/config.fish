# Initialize starship prompt
starship init fish | source

# Add antigravity to PATH
fish_add_path /Users/juanbenjumea/.antigravity/antigravity/bin

# Common directories
fish_add_path ~/Projects
fish_add_path ~/Developer

# Development tools
fish_add_path ~/.local/bin
fish_add_path ~/.cargo/bin
fish_add_path /opt/homebrew/bin

# Enable vi mode
fish_vi_key_bindings

# Settings
set -g fish_greeting
set -x EDITOR nvim
set -x VISUAL nvim
set -x PAGER less

# Aliases
alias ll='eza -la --icons'
alias la='eza -a --icons'
alias lt='eza --tree --icons'
alias cat='bat --style=numbers,changes --theme=Dracula'
alias grep='rg'
alias watch='eza --onelines'

# Editor shortcuts
alias v='nvim'
alias vi='nvim'
alias vim='nvim'

# Git shortcuts
alias g='git'
alias gs='git status'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline --graph --decorate'
