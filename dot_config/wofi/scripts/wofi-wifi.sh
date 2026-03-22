#!/bin/bash

# Get list of connections
# NR>1 skips header
# $1: In-use (*), $2: BSSID (hidden), $3: SSID, $8: Signal, $9: Security
# We want to format it nicely
list=$(nmcli --fields IN-USE,SSID,SECURITY,BARS device wifi list | sed 1d | sed 's/  */ /g' | sed -E "s/^(\*)/$(echo -e '\uf00c')/g" | sed -E "s/^ /  /g")

# Show wofi menu
selected=$(echo -e "$list" | uniq -u | wofi --dmenu --prompt "Wifi Networks" --width 450 --height 400)

read -r chosen_id <<< "${selected:3}"

if [ -z "$chosen_id" ]; then
    exit 0
fi

# Get the full line again to check security
line=$(echo "$list" | grep "$chosen_id")

# If connection is already active, ask to disconnect
if [[ "$selected" =~ "" ]]; then
    if (echo -e "Yes\nNo" | wofi --dmenu --prompt "Disconnect from $chosen_id?") == "Yes"; then
        nmcli connection down id "$chosen_id" | wofi --dmenu --prompt "Status" --width 300 --height 100
    fi
else
    # Check if security is listed
    if [[ "$line" =~ "WPA" ]] || [[ "$line" =~ "WEP" ]]; then
        password=$(wofi --dmenu --password --prompt "Password for $chosen_id" --width 300 --height 100)
    fi
    
    if [ -n "$password" ]; then
        nmcli device wifi connect "$chosen_id" password "$password" | wofi --dmenu --prompt "Status" --width 300 --height 100
    else
        nmcli device wifi connect "$chosen_id" | wofi --dmenu --prompt "Status" --width 300 --height 100
    fi
fi
