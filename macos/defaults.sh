#!/usr/bin/env bash
# macOS system defaults — opinionated power-user setup.
#
# Idempotent: safe to run repeatedly. Run standalone with `./macos/defaults.sh`
# or let bootstrap.sh call it. A few keys need sudo (marked); you'll be prompted.
# Log out / restart for everything to fully apply.
set -euo pipefail

[ "$(uname -s)" = "Darwin" ] || { echo "Not macOS — skipping defaults."; exit 0; }

echo "⚙️  Applying macOS defaults…"

# Close System Settings to avoid it overriding changes we make below.
osascript -e 'tell application "System Settings" to quit' 2>/dev/null || true

# Ask for sudo up front; keep it alive for the duration.
sudo -v
while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done 2>/dev/null &

###############################################################################
# Keyboard & input                                                            #
###############################################################################
# Fast key repeat + short delay (great for vim/nvim). KeyRepeat=1 is the
# fastest the GUI allows; 2 is a safer default if 1 feels too fast.
defaults write NSGlobalDomain KeyRepeat -int 2
defaults write NSGlobalDomain InitialKeyRepeat -int 15
# Allow holding a key to repeat (needed for key-repeat in some editors).
defaults write -g ApplePressAndHoldEnabled -bool false
# Full keyboard access: Tab moves between all controls, not just text fields.
defaults write NSGlobalDomain AppleKeyboardUIMode -int 3
# Disable the "smart"/auto features that fight you while coding.
defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool false
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

###############################################################################
# Finder                                                                      #
###############################################################################
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder AppleShowAllFiles -bool true            # show dotfiles
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true       # full path in title
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"      # list view
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"      # search current folder
defaults write com.apple.finder _FXSortFoldersFirst -bool true
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false
defaults write NSGlobalDomain com.apple.springing.enabled -bool true     # spring-loaded folders
# Don't litter .DS_Store on network or USB volumes.
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true
# Show ~/Library and /Volumes.
chflags nohidden ~/Library 2>/dev/null || true
sudo chflags nohidden /Volumes 2>/dev/null || true

###############################################################################
# Screenshots                                                                 #
###############################################################################
mkdir -p "${HOME}/Screenshots"
defaults write com.apple.screencapture location -string "${HOME}/Screenshots"
defaults write com.apple.screencapture type -string "png"
defaults write com.apple.screencapture disable-shadow -bool true

###############################################################################
# Dock & Mission Control  (you run AeroSpace, so keep the Dock out of the way) #
###############################################################################
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0.15
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock tilesize -int 44
defaults write com.apple.dock mru-spaces -bool false                     # don't reorder Spaces
defaults write com.apple.dock expose-group-apps -bool true

###############################################################################
# Trackpad                                                                    #
###############################################################################
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1

###############################################################################
# UI / behavior                                                               #
###############################################################################
# Expand save & print dialogs by default.
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode2 -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint2 -bool true
# Save to disk (not iCloud) by default for new documents.
defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false
# Don't nag when opening apps downloaded from the internet.
defaults write com.apple.LaunchServices LSQuarantine -bool false
# Faster window resize / sheet animations.
defaults write NSGlobalDomain NSWindowResizeTime -float 0.001
defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool false
# Require password immediately after sleep / screensaver.
defaults write com.apple.screensaver askForPassword -int 1
defaults write com.apple.screensaver askForPasswordDelay -int 0
# Avoid creating .DS_Store everywhere already set above; also disable the
# "application downloaded from the internet" Gatekeeper assessment UI delays.
# TextEdit: plain text by default, UTF-8.
defaults write com.apple.TextEdit RichText -int 0
defaults write com.apple.TextEdit PlainTextEncoding -int 4
defaults write com.apple.TextEdit PlainTextEncodingForWrite -int 4

###############################################################################
# Apply                                                                       #
###############################################################################
echo "🔁 Restarting affected apps…"
for app in "Finder" "Dock" "SystemUIServer"; do
  killall "$app" >/dev/null 2>&1 || true
done

echo "✅ macOS defaults applied. Some changes need a logout/restart to take effect."
