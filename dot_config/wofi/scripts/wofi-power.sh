#!/bin/bash

entries="Lock\nLogout\nSuspend\nReboot\nShutdown"

selected=$(echo -e $entries | wofi --width 250 --height 210 --dmenu --cache-file /dev/null | awk '{print tolower($1)}')

case $selected in
  lock)
    /home/juan/.config/sway/scripts/lock.sh;;
  logout)
    swaymsg exit;;
  suspend)
    exec systemctl suspend;;
  reboot)
    exec systemctl reboot;;
  shutdown)
    exec systemctl poweroff -i;;
esac
