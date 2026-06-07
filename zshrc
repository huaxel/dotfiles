# Minimal zsh for bash compatibility
# Fish is primary shell - this is for scripts/tools that need bash/zsh

{{#if (eq os "macos")}}
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$HOME/.local/bin:$PATH"
{{else}}
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"
{{/if}}
export EDITOR="${EDITOR:-nvim}"
export TERM=xterm-256color

# Starship prompt
eval "$(starship init zsh)"

# Added by LM Studio CLI tool (lms)
export PATH="$PATH:$HOME/.lmstudio/bin"
