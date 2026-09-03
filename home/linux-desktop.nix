# Linux desktop configuration shared by framearch and arch-wsl, matching the
# Dotter "linux" package it replaces. Files map one-to-one from config-linux/.
{ ... }:

{
  home.file.".config/llamaman/config.json".source = ../config-linux/llamaman/config.json;

  home.file.".config/sway/config".source = ../config-linux/sway/config;
  home.file.".config/sway/config.d/01-variables.conf".source = ../config-linux/sway/config.d/01-variables.conf;
  home.file.".config/sway/config.d/02-outputs.conf".source = ../config-linux/sway/config.d/02-outputs.conf;
  home.file.".config/sway/config.d/03-inputs.conf".source = ../config-linux/sway/config.d/03-inputs.conf;
  home.file.".config/sway/config.d/04-keybindings.conf".source = ../config-linux/sway/config.d/04-keybindings.conf;
  home.file.".config/sway/config.d/05-visuals.conf".source = ../config-linux/sway/config.d/05-visuals.conf;
  home.file.".config/sway/config.d/06-rules.conf".source = ../config-linux/sway/config.d/06-rules.conf;
  home.file.".config/sway/config.d/07-autostart.conf".source = ../config-linux/sway/config.d/07-autostart.conf;
  home.file.".config/sway/scripts/autotiling.sh".source = ../config-linux/sway/scripts/autotiling.sh;
  home.file.".config/sway/scripts/lock.sh".source = ../config-linux/sway/scripts/lock.sh;
  home.file.".config/sway/scripts/switch-kb-layout.sh".source = ../config-linux/sway/scripts/switch-kb-layout.sh;
  home.file.".config/sway/scripts/toggle-keyboard.sh".source = ../config-linux/sway/scripts/toggle-keyboard.sh;
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
