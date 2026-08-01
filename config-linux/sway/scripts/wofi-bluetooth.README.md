# wofi-bluetooth

Lightweight keyboard-first Bluetooth manager using `bluetoothctl` and `wofi`.

Files installed
- `~/.config/sway/scripts/wofi-bluetooth.sh` — main script (executable)
- `~/.config/waybar/config` — example Waybar module calling the script on-click
- `~/.config/sway/config` — appended `bindsym $mod+b` and `bar { swaybar_command waybar }`
- `~/.config/wofi/style.css` — optional Wofi styling

Quick usage

- Launch via Waybar click or keyboard: `Mod + b` (reload sway config with `swaymsg reload`).
- Use the menu to toggle power, scan, connect/disconnect, trust, or remove devices.
- The `Connect to Headphones (A2DP)` option attempts to connect and set the card profile to A2DP.

Dependencies

- `bluez` (bluetoothctl)
- `wofi` (menu)
- `waybar` (status bar) or another bar that can call the script
- `pactl` (PulseAudio/pipewire-pulse) — used to switch to `a2dp_sink` where possible
- `libnotify`/`notify-send` (optional) for notifications

Battery display

Waybar's `bluetooth` module will show battery information for connected devices if the underlying backend exposes it. The provided `waybar/config` uses `format-connected-battery` so battery will be shown only for connected devices.

WirePlumber / DBus notes (desktop guidance)

- Minimal / working setup (recommended for a desktop):
  - Use PipeWire with `pipewire-pulse` (so `pactl` is available). The script will call `pactl set-card-profile <card> a2dp_sink` as a best-effort to enable A2DP after connecting.
  - This approach works on most Linux desktops without extra DBus code and keeps the script simple.

- If you prefer a more robust WirePlumber integration (optional):
  - WirePlumber exposes richer session hooks and DBus APIs that let you reliably pick the right endpoint/profile and handle profile switching per-device.
  - Implementing that requires either a small Python script using DBus (e.g., `dbus-next`) or calling `wpctl`/WirePlumber CLI utilities where available. I can add this if you want deterministic profile switching across setups.

Permissions and environment

- `bluetoothctl` usually works for your user if BlueZ is running system-wide. If you encounter permission errors, ensure your user is in the appropriate groups or run Bluetoothctl via Polkit rules.

Reloading

- Reload Waybar: `pkill -USR1 waybar` or restart Waybar
- Reload Sway config: `swaymsg reload`

Troubleshooting

- No devices listed: make sure `bluetoothctl` shows devices with `bluetoothctl devices` and that your adapter is powered (`bluetoothctl show`).
- Profile switch not applied: check `pactl list cards short` to see card names and whether the MAC appears underscored (the script uses a best-effort mapping). If your system uses different names, I can add a mapping layer.

Next steps I can take (pick one)

1. Add WirePlumber DBus profile switching (Python DBus implementation) for deterministic A2DP switching.
2. Improve A2DP detection/mapping for your specific PipeWire setup (I can probe `pactl` output and tune the script).
3. Create a small systemd user service to ensure Bluetooth scanning/pairing policies.

If you want (1) or (2), tell me which option and I will implement it.
