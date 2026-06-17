#!/bin/bash
# Sketchybar-style app icon for focused window
# Maps app_id to Nerd Font icons

get_icon() {
    case "$1" in
        # Browsers
        "app.zen-browser.zen"*|"zen"*) echo "󰖟" ;; # or 󰇧 for generic browser
        "firefox"*) echo "󰈹" ;;
        "chromium"*|"google-chrome"*) echo "󰊯" ;;
        "brave"*) echo "󰖟" ;;
        "qutebrowser"*) echo "󰖟" ;;
        
        # Terminals
        "com.mitchellh.ghostty"*|"ghostty"*) echo "󰊠" ;;
        "org.wezfurlong.wezterm"*|"wezterm"*) echo "󰊠" ;;
        "kitty"*) echo "󰄛" ;;
        "alacritty"*) echo "󰊠" ;;
        "foot"*) echo "󰊠" ;;
        "tmux"*) echo "󰕮" ;;
        
        # Editors/IDEs
        "codium"*) echo "󰨞" ;;
        "nvim"*|"neovim"*) echo "󰕷" ;;
        "vim"*) echo "" ;;
        "emacs"*) echo "󰕷" ;;
        "sublime_text"*) echo "󰘦" ;;
        "zeditor"*) echo "󰘦" ;;
        
        # Notes/Knowledge
        "md.obsidian"*|"obsidian"*) echo "󰠮" ;;
        "logseq"*) echo "󰠮" ;;
        "notion"*) echo "󰠮" ;;
        "joplin"*) echo "󰠮" ;;
        
        # Communication
        "com.mitchellh.discord"*|"discord"*) echo "󰙯" ;;
        "net.whatsApp.WhatsApp"*|"whatsapp"*) echo "󰖨" ;;
        "slack"*) echo "󰒱" ;;
        "telegramdesktop"*|"telegram"*) echo "󰔍" ;;
        "signal"*) echo "󰭹" ;;
        "zoom"*) echo "󰻉" ;;
        "teams"*|"Microsoft Teams"*) echo "󰊻" ;;
        
        # Media
        "mpv"*) echo "󰕼" ;;
        "vlc"*) echo "󰕼" ;;
        "spotify"*) echo "󰓇" ;;
        "ncmpcpp"*|"cmus"*) echo "󰎆" ;;
        "youtube"*) echo "󰗃" ;;
        
        # Files
        "org.kde.dolphin"*|"dolphin"*) echo "󰉋" ;;
        "nautilus"*|"files"*) echo "󰉋" ;;
        "thunar"*) echo "󰉋" ;;
        "pcmanfm"*) echo "󰉋" ;;
        "ranger"*) echo "󰉋" ;;
        
        # Git/Dev tools
        "lazygit"*) echo "󰊢" ;;
        "github-desktop"*) echo "󰊢" ;;
        
        # Mail
        "thunderbird"*) echo "󰇮" ;;
        "himalaya"*|"neomutt"*) echo "󰇮" ;;
        "protonmail"*) echo "󰇮" ;;
        
        # System/GUI
        "wofi"*) echo "󰀻" ;;
        "fuzzel"*) echo "󰀻" ;;
        "pavucontrol"*) echo "󰕾" ;;
        "blueman"*) echo "󰂯" ;;
        "nm-connection-editor"*) echo "󰤨" ;;
        
        # Games
        "steam"*) echo "󰓓" ;;
        "lutris"*) echo "󰓓" ;;
        
        # Default
        *) echo "󰣆" ;;
    esac
}

# Get focused window app_id
app_id=$(swaymsg -t get_tree | jq -r '.. | objects | select(.focused == true) | .app_id // .window_properties.class // "unknown"')

# Get window title
title=$(swaymsg -t get_tree | jq -r '.. | objects | select(.focused == true) | .name // "Desktop"')

# Get icon
icon=$(get_icon "$app_id")

# Output for waybar (icon + truncated title)
# Sketchybar style: just icon for minimal, or icon + short title
echo "{\"text\": \"$icon $title\", \"tooltip\": \"$app_id: $title\", \"class\": \"$app_id\"}"
