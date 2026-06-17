# Minimal zsh/bash for script compatibility
# Fish is primary shell — this is for tools that need bash/zsh

# OS-specific PATH
case "$(uname)" in
    Darwin)
        export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$HOME/.local/bin:$PATH"
        ;;
    *)
        export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"
        ;;
esac

export EDITOR="${EDITOR:-nvim}"
export TERM=xterm-256color

# Starship prompt
eval "$(starship init zsh)"

# LM Studio
export PATH="$PATH:$HOME/.lmstudio/bin"
