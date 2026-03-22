#!/bin/bash
# weather.sh - Fetches weather from wttr.in and formats for Waybar

# Cache file
CACHE_FILE="/tmp/wttr_cache"
# Cache duration in seconds (e.g., 30 minutes)
CACHE_DURATION=1800

# Check if cache exists and is fresh
if [ -f "$CACHE_FILE" ] && [ $(($(date +%s) - $(stat -c %Y "$CACHE_FILE"))) -lt $CACHE_DURATION ]; then
    cat "$CACHE_FILE"
    exit 0
fi

# Fetch weather
# Format: %c (icon) %t (temp)
# "Frankfurt" is used as default, or auto-detect if omitted. 
# Using specific format for JSON safety is better, but raw text display is simpler for now.
# We will use format=j1 for full JSON if we wanted complex parsing, 
# but for simple display, simple format is enough.
# However, waybar expects JSON for tooltips.

# Let's try raw one-liner format first
# %c = Condition icon, %t = Temp, %C = Condition text
weather=$(curl -s "wttr.in/Brussels,Belgium?format=%c+%t\n")
tooltip=$(curl -s "wttr.in/Brussels,Belgium?format=%C+%t+\nForecast:+%w\n")


if [ -z "$weather" ]; then
    echo '{"text": "N/A", "tooltip": "Weather unavailable"}'
    exit 1
fi

# Escape for JSON
tooltip=$(echo "$tooltip" | sed ':a;N;$!ba;s/\n/\\n/g' | sed 's/"/\\"/g')

# Output JSON
json="{\"text\": \"$weather\", \"tooltip\": \"$tooltip\"}"
echo "$json" > "$CACHE_FILE"
echo "$json"
