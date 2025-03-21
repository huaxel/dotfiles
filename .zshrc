# -------------------------------
# Environment Setup
# -------------------------------

# Path to your Oh My Zsh installation.
export ZSH="$HOME/.config/oh-my-zsh"
source $ZSH/oh-my-zsh.sh
export PATH="/opt/homebrew/bin:$PATH"
export PATH="$PATH:$(go env GOPATH)/bin"
export PATH="$HOME/.rbenv/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
export PATH="/opt/homebrew/sbin:$PATH"

if [[ -n $SSH_CONNECTION ]]; then
   export EDITOR='vim'
else
   export EDITOR='nvim'
fi

ZSH_THEME="powerlevel10k/powerlevel10k"

# -------------------------------
# Oh My Zsh and Plugins
# -------------------------------
plugins=(
  git
  zsh-autosuggestions
  zsh-syntax-highlighting
  brew
  python
  colored-man-pages
  command-not-found
  fzf
  zoxide
)

source $ZSH/custom/themes/powerlevel10k/powerlevel10k.zsh-theme

# -------------------------------
# Aliases (Custom Commands)
# -------------------------------
alias ls='eza --icons=always -a'
alias cd="z"
alias brewup="brew update && brew upgrade && brew cleanup && brew doctor"
 
# azure
alias vmstart="az vm start --resource-group rg-srvos-2425S2-1277-juan.benjumea.moreno --name srvos-2425S2-1277-juan.benjumea.moreno"
alias vmstop="az vm deallocate --resource-group rg-srvos-2425S2-1277-juan.benjumea.moreno --name srvos-2425S2-1277-juan.benjumea.moreno"
alias vmlist="az vm list --show-details --output table"
alias vmstatus="az vm get-instance-view --resource-group rg-srvos-2425S2-1277-juan.benjumea.moreno --name srvos-2425S2-1277-juan.benjumea.moreno" --query "instanceView.statuses"

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
