# Linux desktop configuration shared by framearch (niri) and arch-wsl.
# Compositor-specific files live in the host module (framearch.nix maps
# niri; arch-wsl.nix maps sway). Only compositor-agnostic helpers stay here
# (lock.sh, walker-files.sh and the wofi menus are referenced by both).
{ ... }:

{
  home.file.".config/llamaman/config.json".source = ../config-linux/llamaman/config.json;

  home.file.".config/sway/scripts/lock.sh".source = ../config-linux/sway/scripts/lock.sh;
  home.file.".config/sway/scripts/walker-files.sh".source = ../config-linux/sway/scripts/walker-files.sh;
  home.file.".config/sway/scripts/wofi-bluetooth.README.md".source = ../config-linux/sway/scripts/wofi-bluetooth.README.md;
  home.file.".config/sway/scripts/wofi-bluetooth.sh".source = ../config-linux/sway/scripts/wofi-bluetooth.sh;

  home.file.".config/walker/config.toml".source = ../config-linux/walker/config.toml;

  home.file.".config/waybar/config".source = ../config-linux/waybar/config;
  home.file.".config/waybar/style.css".source = ../config-linux/waybar/style.css;
  home.file.".config/waybar/scripts/app-icon.sh".source = ../config-linux/waybar/scripts/app-icon.sh;
  home.file.".config/waybar/scripts/weather.sh".source = ../config-linux/waybar/scripts/weather.sh;
  home.file.".config/waybar/scripts/workspaces.sh".source = ../config-linux/waybar/scripts/workspaces.sh;

  home.file.".config/wofi/config".source = ../config-linux/wofi/config;
  home.file.".config/wofi/style.css".source = ../config-linux/wofi/style.css;
  home.file.".config/wofi/scripts/wofi-power.sh".source = ../config-linux/wofi/scripts/wofi-power.sh;
  home.file.".config/wofi/scripts/wofi-wifi.sh".source = ../config-linux/wofi/scripts/wofi-wifi.sh;

  home.file.".config/xkb/symbols/mac_colemak".source = ../config-linux/xkb/symbols/mac_colemak;
}
