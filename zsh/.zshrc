zmodload zsh/zprof
# Enable Powerlevel10k instant prompt
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# -------------------------------
# Environment Setup
# -------------------------------
export ZSH="$HOME/.config/oh-my-zsh"
source $ZSH/oh-my-zsh.sh
export PATH="/opt/homebrew/bin:$PATH"
export PATH="$PATH:$(go env GOPATH)/bin"

if [[ -n $SSH_CONNECTION ]]; then
   export EDITOR='vim'
else
   export EDITOR='nvim'
fi

ZSH_THEME="powerlevel10k/powerlevel10k"

zstyle ':omz:update' mode auto
zstyle ':omz:update' frequency 13
ENABLE_CORRECTION="true"
source ~/.config/.p10k.zsh
# -------------------------------
# Oh My Zsh and Plugins
# -------------------------------
plugins=(
  git
  zsh-autosuggestions
  zsh-syntax-highlighting
  zsh-completions
  brew
  tmux
  python
  colored-man-pages
  command-not-found
  fzf
  zoxide
)

source /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme
source $ZSH/oh-my-zsh.sh

# Ruby
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"

# -------------------------------
# Aliases (Custom Commands)
# -------------------------------
alias ls='eza --icons=always -a'
alias cd="z"
alias conda-init="source /opt/homebrew/Caskroom/miniconda/base/etc/profile.d/conda.sh"
alias brewup="brew update && brew upgrade && brew cleanup && brew doctor"
alias tmux='tmux -f ~/.config/tmux/.tmux.conf'

# Python Paths
export PATH="$PATH:/Users/juanbenjumea/.local/bin"
export PATH="/opt/homebrew/Caskroom/miniconda/base/envs/juanpython/bin:$PATH"
function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
		builtin cd -- "$cwd"
	fi
	rm -f -- "$tmp"
}
