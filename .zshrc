zmodload zsh/zprof
# Enable Powerlevel10k instant prompt
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# >>> Powerlevel10k instant prompt setup >>>
if [[ -r ~/.p10k.zsh ]]; then
  source ~/.p10k.zsh
fi

# -------------------------------
# Environment Setup
# -------------------------------
export ZSH="$HOME/.oh-my-zsh"
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
alias ls="eza --icons=always"
alias cd='z'
alias conda-init='source /opt/homebrew/Caskroom/miniconda/base/etc/profile.d/conda.sh'

# Python Paths
export PATH="$PATH:/Users/juanbenjumea/.local/bin"
export PATH="/opt/homebrew/Caskroom/miniconda/base/envs/juanpython/bin:$PATH"
