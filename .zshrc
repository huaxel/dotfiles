# >>> Powerlevel10k instant prompt setup >>>
if [[ -r ~/.p10k.zsh ]]; then
  source ~/.p10k.zsh
fi

# -------------------------------
# Environment Setup
# -------------------------------
export ZSH="$HOME/.oh-my-zsh"
# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
   export EDITOR='vim'
 else
   export EDITOR='nvim'
 fi

# Set name of the theme to load --- if set to "random", it will
ZSH_THEME="powerlevel10k/powerlevel10k"

# OMZ options
zstyle ':omz:update' mode auto      # update automatically without asking
zstyle ':omz:update' frequency 13

# Uncomment the following line to enable command auto-correction.
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
)
source /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme
source $ZSH/oh-my-zsh.sh
##--ruby correct version
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"
# -------------------------------
# Aliases (Custom Commands)
# -------------------------------
alias ls='colorls -a'
# Custom alias for Neovim config
alias nvimconfig="nvim ~/.config/nvim/init.lua"
alias zshconfig="nvim ~/.zshrc"
export PATH=$PATH:/opt/mssql-tools/bin