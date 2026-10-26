#!/bin/bash
# Custom workspace indicator for Waybar - always shows 10 workspaces
# Mimics macOS Dock spaces. Niri-only (via `niri msg`).

ws_json=$(niri msg -j workspaces 2>/dev/null)
focused=$(echo "$ws_json" | jq -r '[.[] | select(.is_focused) | (.name // "\(.idx)")] | first // "1"')
exists_names=$(echo "$ws_json" | jq -r '.[] | (.name // "\(.idx)")')

# Build output for all 10 workspaces
output=""
for i in {1..10}; do
    # Check if workspace exists and has windows
    exists=$(echo "$exists_names" | grep -x "$i" || true)

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
