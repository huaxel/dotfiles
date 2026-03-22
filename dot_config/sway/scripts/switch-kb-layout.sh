#!/bin/bash
# Lightweight keyboard layout switcher — no config reload, no symlinks
# Cycles through XKB layouts (Colemak / QWERTY UK) via swaymsg

KBD_GLOB="3434:D030:*"

# Get current layout index from sway's device state
CURRENT=$(swaymsg -t get_inputs | jq -r '.[] | select(.identifier | startswith("3434:D030")) | .xkb.active_layout_index')

if [ "$CURRENT" = "0" ]; then
    swaymsg input "$KBD_GLOB" xkb_switch_layout 1
else
    swaymsg input "$KBD_GLOB" xkb_switch_layout 0
fi
