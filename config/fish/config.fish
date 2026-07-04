# Initialize starship prompt
starship init fish | source

# Suppress mise rate-limit / version-check spam
set -x MISE_LOG_LEVEL error

# Activate mise (version manager)
if command -sq mise
    mise activate fish | source
end

# Atuin — shell history with sync
if command -sq atuin
    atuin init fish | source
end

# FZF — fuzzy finder keybindings
if command -sq fzf
    fzf --fish | source
end

# Zoxide — smart cd
if command -sq zoxide
    zoxide init fish | source
end

# Cross-platform PATH additions
fish_add_path $HOME/.local/bin
fish_add_path $HOME/.cargo/bin

# OS-specific PATH
if test (uname) = Darwin
    fish_add_path /opt/homebrew/bin
    fish_add_path /opt/local/bin
    fish_add_path $HOME/.antigravity/antigravity/bin
else
    fish_add_path /usr/local/bin
    fish_add_path /usr/bin
end

# Note: ~/Projects and ~/Developer are workspace directories, not binary paths

# HuggingFace cache — use fast storage when available, else default
if test -d /mnt/ai_models
    set -gx HF_HOME /mnt/ai_models
    set -gx HF_HUB_CACHE /mnt/ai_models/models
end

# Enable vi mode
fish_vi_key_bindings

# Settings
set -g fish_greeting
set -x EDITOR nvim
set -x VISUAL nvim
set -x PAGER less
set -x XDG_CONFIG_HOME $HOME/.config
set -x EZA_CONFIG_DIR $HOME/.config/eza
set -x PI_CODING_AGENT_DIR $HOME/.pi/agent


# Run pi as restricted pi-agent user
alias pi-sudo='sudo -iu pi-agent PI_CODING_AGENT_DIR=$HOME/.pi/agent -- pi'

# FZF defaults
set -x FZF_DEFAULT_OPTS "--height 40% --layout=reverse --border --preview 'bat --color=always --style=numbers --line-range=:500 {}' --preview-window=right:60%"
set -x FZF_CTRL_T_OPTS "--preview 'bat --color=always --style=numbers --line-range=:500 {}' --preview-window=right:60%"
set -x FZF_CTRL_R_OPTS "--preview 'echo {}' --preview-window=up:3:hidden:wrap --bind 'ctrl-/:toggle-preview'"
set -x FZF_ALT_C_OPTS "--preview 'eza --tree --color=always --icons {} | head -200' --preview-window=right:60%"

# Bat as man pager
set -x MANPAGER "sh -c 'col -bx | bat -l man -p --theme=tokyonight_night'"

# Aliases
alias ls='eza -la --icons'
if not test (uname) = Darwin
    alias open='xdg-open' 2>/dev/null || true
end

alias ll='eza -la --icons'
alias la='eza -a --icons'
alias lt='eza --tree --icons'
alias cat='bat --style=numbers,changes --theme=tokyonight_night'
alias grep='rg'
alias watch='eza --onelines'

# Editor shortcuts
alias v='nvim'
alias vi='nvim'
alias vim='nvim'

# SSH tunnel helper

# Mise aliases
alias m='mise'
alias mr='mise run'
alias ml='mise list'

# Bun aliases
alias b='bun'
alias bi='bun install'
alias br='bun run'
alias bx='bunx'

# Remote dev shortcuts
alias ssh-mosh='mosh'
alias ssh-tunnel='autossh -M 0 -N'

# Git with delta
alias gd='git diff'
alias gds='git diff --staged'
alias glg='git log --oneline --graph --decorate'

# Modern replacements (only alias if the tool is installed)
if command -sq bat
    alias cat='bat --style=numbers,changes --theme=tokyonight_night'
end
if command -sq fd
    alias find='fd'
end
if command -sq procs
    alias ps='procs'
end
if command -sq dust
    alias du='dust'
end
if command -sq duf
    alias df='duf'
end
if command -sq btop
    alias top='btop'
end

# Global justfile
alias j='just --justfile ~/.config/just/justfile'
set -gx JUST_GLOBAL_JUSTFILE ~/.config/just/justfile

# Git shortcuts
alias g='git'
alias gs='git status'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline --graph --decorate'

# WSL-specific
if test -f /proc/version && grep -q Microsoft /proc/version
    alias explorer='explorer.exe'
end

# opencode
fish_add_path $HOME/.opencode/bin

# bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH

# Bang-bang: !! and !$ history expansion
function bind_bang
    switch (commandline -t)
        case "!"
            commandline -t $history[1]
            commandline -f repaint
        case "*"
            commandline -i !
    end
end

function bind_dollar
    switch (commandline -t)
        case "!"
            commandline -t ""
            set -l last_token (string split " " $history[1])[-1]
            commandline -i $last_token
            commandline -f repaint
        case "*"
            commandline -i '$'
    end
end

function fish_user_key_bindings
    bind -M insert ! bind_bang
    bind -M insert '$' bind_dollar
    bind -M insert alt-up history-token-search-backward
    bind -M insert alt-. history-token-search-backward
end

# fish_user_key_bindings is auto-called by fish; no need to invoke manually
fish_add_path $HOME/.npm-global/bin
if test -f ~/.config/secrets/env.fish
    source ~/.config/secrets/env.fish
end

# pnpm
set -gx PNPM_HOME "/home/juan/.local/share/pnpm"
if not string match -q -- "$PNPM_HOME/bin" $PATH
  set -gx PATH "$PNPM_HOME/bin" $PATH
end
# pnpm end
