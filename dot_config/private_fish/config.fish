# Initialize starship prompt
starship init fish | source

# Cross-platform PATH additions
fish_add_path $HOME/.local/bin
fish_add_path $HOME/.cargo/bin
fish_add_path $HOME/.local/share/go/bin
fish_add_path $HOME/.lmstudio/bin
fish_add_path $HOME/.dotnet/tools

# OS-specific PATH
if test (uname) = "Darwin"
    fish_add_path /opt/homebrew/bin
    fish_add_path /opt/local/bin
    fish_add_path $HOME/.antigravity/antigravity/bin
else
    fish_add_path /usr/local/bin
    fish_add_path /usr/bin
end

# Common directories
fish_add_path ~/Projects
fish_add_path ~/Developer

# Enable vi mode
fish_vi_key_bindings

# Settings
set -g fish_greeting
set -x EDITOR nvim
set -x VISUAL nvim
set -x PAGER less
set -x XDG_CONFIG_HOME $HOME/.config

# Cross-platform aliases
alias ls='eza -la --icons'

if test (uname) != "Darwin"
    alias open='xdg-open' 2>/dev/null || true
end

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
alias gst='git status'

# WSL-specific
if test -f /proc/version && grep -q Microsoft /proc/version
    alias explorer='explorer.exe'
    alias code='code.exe'
end

# Machine-specific local config (not managed by chezmoi)
if test -f ~/.config/fish/local.fish
    source ~/.config/fish/local.fish
end
