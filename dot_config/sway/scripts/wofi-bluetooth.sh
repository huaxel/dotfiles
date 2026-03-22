#!/usr/bin/env bash

# Lightweight Wofi frontend for bluetoothctl
# Supports: toggle power, scan, connect/disconnect/trust/forget, and A2DP macro

set -euo pipefail

notify() {
    if command -v notify-send >/dev/null 2>&1; then
        notify-send "Bluetooth" "$1"
    fi
}

get_paired_devices() {
    bluetoothctl devices | cut -d ' ' -f 3-
}

get_status() {
    bluetoothctl show | grep "Powered" | awk '{print $2}' || echo "no"
}

set_a2dp() {
    mac="$1"
    # Convert MAC to the card name format used by PulseAudio/pipewire (underscores)
    mac_underscored=$(echo "$mac" | tr ':' '_')

    log() { echo "$(date --iso-8601=seconds) $*" >> ~/.cache/wofi-bluetooth.log 2>/dev/null || true; }

    if command -v pactl >/dev/null 2>&1; then
        # Prefer explicit bluez_card.<MAC> names, fallback to any card containing the underscored MAC
        card=$(pactl list cards short | awk '{print $2}' | grep -Ei "bluez_card\.${mac_underscored}|${mac_underscored}" || true)
        if [ -n "$card" ]; then
            log "Found card: $card for $mac"
            # Try common profile names used between PulseAudio and PipeWire
            for profile in a2dp_sink a2dp-sink a2dp; do
                if pactl set-card-profile "$card" "$profile" 2>/dev/null; then
                    log "Set profile $profile on $card"
                    return 0
                fi
            done
            log "Failed to set A2DP profile on $card"
        else
            log "No matching pactl card found for $mac"
        fi
    else
        log "pactl not available"
    fi
}

main() {
    devices=$(get_paired_devices)
    status=$(get_status)

    options="Toggle Power ($status)\nScan for Devices\nConnect to Headphones (A2DP)\n$devices"

    chosen=$(echo -e "$options" | wofi --dmenu --prompt "Bluetooth" --width 400 --height 300)
    [ -z "$chosen" ] && exit 0

    case "$chosen" in
        "Toggle Power (yes)") bluetoothctl power off ; notify "Power off" ; exit 0 ;;
        "Toggle Power (no)") bluetoothctl power on ; notify "Power on" ; exit 0 ;;
        "Scan for Devices")
            notify "Scanning for 15 seconds..."
            bluetoothctl scan on & sleep 15 && bluetoothctl scan off
            exit 0
            ;;
        "Connect to Headphones (A2DP)")
            # Try to find likely headphone devices by name
            headsets=$(echo -e "$devices" | grep -Ei "Headphones|Headset|AirPods|Earbud|Earbuds|Buds|WH-|QC-|Bose|Sony|Sennheiser" || true)
            if [ -z "$headsets" ]; then
                notify "No paired headphones found.";
                exit 0
            fi
            target=$(echo -e "$headsets" | wofi --dmenu --prompt "Headphones" --width 400 --height 300)
            [ -z "$target" ] && exit 0
            mac=$(bluetoothctl devices | grep "$target" | awk '{print $2}')
            if [ -n "$mac" ]; then
                bluetoothctl connect "$mac"
                sleep 2
                set_a2dp "$mac"
            fi
            exit 0
            ;;
    esac

    # If a device name was chosen from the list
    mac=$(bluetoothctl devices | grep "$chosen" | awk '{print $2}')
    if [ -n "$mac" ]; then
        action=$(echo -e "Connect\nConnect (A2DP)\nDisconnect\nTrust\nForget" | wofi --dmenu --prompt "$chosen" --width 300)
        case "$action" in
            "Connect") bluetoothctl connect "$mac" ; notify "Connecting $chosen" ;;
            "Connect (A2DP)") bluetoothctl connect "$mac" && sleep 2 && set_a2dp "$mac" ; notify "Connecting (A2DP) $chosen" ;;
            "Disconnect") bluetoothctl disconnect "$mac" ; notify "Disconnecting $chosen" ;;
            "Trust") bluetoothctl trust "$mac" ; notify "Trusted $chosen" ;;
            "Forget") bluetoothctl remove "$mac" ; notify "Removed $chosen" ;;
        esac
    fi
}

main "$@"
