#!/bin/bash
# shellcheck disable=SC2016
KEYBOARD='13364:53296:Keychron__Keychron_Link__Keyboard'
BRITISH_CONF="input \"$KEYBOARD\" {
    xkb_layout \"gb,mac_colemak\"
    xkb_variant \",basic\"
}
"
COLEMAK_CONF="input \"$KEYBOARD\" {
    xkb_layout \"mac_colemak,gb\"
    xkb_variant \"basic,\"
}
"

# Set SWAYSOCK if not set (for when called from keybinding)
if [ -z "$SWAYSOCK" ]; then
    # shellcheck disable=SC2012
    SWAYSOCK=$(ls -t "/run/user/$(id -u)"/sway-ipc.* 2>/dev/null | head -n1)
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
