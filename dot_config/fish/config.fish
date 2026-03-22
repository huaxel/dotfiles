source /usr/share/cachyos-fish-config/cachyos-config.fish

# Added by LM Studio CLI (lms)
fish_add_path /home/juan/.lmstudio/bin
fish_add_path /home/juan/.local/bin
fish_add_path /home/juan/.dotnet/tools

#\
set -gx PATH $PATH /home/juan/.local/bin
set -gx PATH $PATH /home/juan/.dotnet/tools

set -gx HF_HUB_CACHE /mnt/ai_models/models

# Electron Apps: Use native Wayland to prevent freezing
set -gx ELECTRON_OZONE_PLATFORM_HINT wayland

set -gx HSA_OVERRIDE_GFX_VERSION 11.0.0
set -gx ROCM_PATH /opt/rocm

# Force Wayland clients to speak Colemak
# Force Ghostty to use X11 backend
alias ghostty 'env GDK_BACKEND=x11 ghostty'

set -gx XKB_DEFAULT_LAYOUT us
set -gx XKB_DEFAULT_VARIANT colemak
set -gx XKB_DEFAULT_MODEL pc105

set -x XDG_CURRENT_DESKTOP sway
set -x GTK_USE_PORTAL 1
set -gx XCURSOR_SIZE 24

# Clipboard aliases
alias yank 'xclip -selection clipboard -o'
alias put 'xclip -selection clipboard'
alias wl-copy 'wl-copy'
alias wl-paste 'wl-paste'

# Modern CLI aliases
alias ls 'exa --icons --git --group-directories-first'
alias ll 'exa -lah --icons --git --group-directories-first'
alias la 'exa -a --icons --git --group-directories-first'
alias tree 'tree -aI ".git|node_modules|target|.cache" --color=always'
alias cat 'bat --color=always'
alias df 'duf'
alias ps 'procs'
alias top 'glances'
