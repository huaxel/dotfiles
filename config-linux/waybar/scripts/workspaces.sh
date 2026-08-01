#!/bin/bash
# Custom workspace indicator for Waybar - always shows 10 workspaces
# Mimics macOS Dock spaces

# Get current focused workspace
focused=$(swaymsg -t get_workspaces | jq -r '.[] | select(.focused) | .name')

# Build output for all 10 workspaces
output=""
for i in {1..10}; do
    # Check if workspace exists and has windows
    exists=$(swaymsg -t get_workspaces | jq -r ".[] | select(.name == \"$i\") | .name")
    
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
