#!/bin/bash
# Custom workspace indicator for Waybar - always shows 10 workspaces
# Mimics macOS Dock spaces
# Works under niri (via `niri msg`) and sway (via swaymsg).

if niri msg -j workspaces >/dev/null 2>&1; then
    ws_json=$(niri msg -j workspaces 2>/dev/null)
    focused=$(echo "$ws_json" | jq -r '[.[] | select(.is_focused) | (.name // "\(.idx)")] | first // "1"')
    exists_names=$(echo "$ws_json" | jq -r '.[] | (.name // "\(.idx)")')
    is_niri=1
else
    focused=$(swaymsg -t get_workspaces | jq -r '.[] | select(.focused) | .name')
    is_niri=0
fi

# Build output for all 10 workspaces
output=""
for i in {1..10}; do
    # Check if workspace exists and has windows
    if [ "$is_niri" = 1 ]; then
        exists=$(echo "$exists_names" | grep -x "$i" || true)
    else
        exists=$(swaymsg -t get_workspaces | jq -r ".[] | select(.name == \"$i\") | .name")
    fi
    
    if [ "$i" == "$focused" ]; then
        # Focused workspace
        output+="<span color='#76cce0'><b> $i </b></span>"
    elif [ -n "$exists" ]; then
        # Workspace exists (has windows)
        output+="<span color='#e2e2e3'> $i </span>"
    else
        # Empty workspace (dimmed)
        output+="<span color='#555555'> $i </span>"
    fi
done

echo "{\"text\": \"$output\", \"tooltip\": \"Workspaces 1-10\"}"
