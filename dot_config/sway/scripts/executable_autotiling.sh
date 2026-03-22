#!/bin/bash
# Autotiling script for sway using jq
# Requires: jq

swaymsg -t subscribe -m '["window"]' | jq --unbuffered -r '.change' | while read -r change; do
    if [ "$change" = "focus" ]; then
        # Get the focused window's geometry
        focused=$(swaymsg -t get_tree | jq -r 'recurse(.nodes[]?, .floating_nodes[]?) | select(.focused) | .rect')
        width=$(echo "$focused" | jq '.width')
        height=$(echo "$focused" | jq '.height')

        if [ "$width" -gt "$height" ]; then
            swaymsg split h
        else
            swaymsg split v
        fi
    fi
done
