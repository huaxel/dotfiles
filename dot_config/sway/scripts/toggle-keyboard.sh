#!/bin/bash
BRITISH_CONF='input "type:keyboard" {
    xkb_file "/home/juan/.config/xkb/symbols/gb_qwerty"
}
'
COLEMAK_CONF='input "type:keyboard" {
    xkb_file "/home/juan/.config/xkb/symbols/mac_colemak"
}
'

# Set SWAYSOCK if not set (for when called from keybinding)
if [ -z "$SWAYSOCK" ]; then
    SWAYSOCK=$(ls -t /run/user/$(id -u)/sway-ipc.* 2>/dev/null | head -n1)
    export SWAYSOCK
fi

CURRENT=$(cat ~/.config/sway/config.d/03-inputs.conf 2>/dev/null)

if grep -q "mac_colemak" <<< "$CURRENT"; then
    echo "$BRITISH_CONF" > ~/.config/sway/config.d/03-inputs.conf
else
    echo "$COLEMAK_CONF" > ~/.config/sway/config.d/03-inputs.conf
fi

# Reload sway to apply changes
if [ -n "$SWAYSOCK" ]; then
    swaymsg -s "$SWAYSOCK" reload
else
    swaymsg reload
fi
