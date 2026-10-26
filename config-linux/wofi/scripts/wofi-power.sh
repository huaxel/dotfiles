#!/bin/bash

entries="Lock\nLogout\nSuspend\nReboot\nShutdown"

selected=$(echo -e $entries | wofi --width 250 --height 210 --dmenu --cache-file /dev/null | awk '{print tolower($1)}')

case $selected in
  lock)
    ~/.config/desktop/scripts/lock.sh;;
  logout)
    if pgrep -x niri >/dev/null 2>&1; then
        niri msg action quit skip-confirmation=true
    else
        loginctl terminate-session "${XDG_SESSION_ID:-$PPID}"
    fi;;
  suspend)
    exec systemctl suspend;;
  reboot)
    exec systemctl reboot;;
  shutdown)
    exec systemctl poweroff -i;;
esac
