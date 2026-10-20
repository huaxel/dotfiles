{ ... }:

{
  imports = [ ./linux-desktop.nix ];

  # arch-wsl keeps sway (framearch moved to niri). These mappings preserve
  # the exact pre-split $HOME state on this host.
  home.file.".config/sway/config".source = ../config-linux/sway/config;
  home.file.".config/sway/config.d/01-variables.conf".source = ../config-linux/sway/config.d/01-variables.conf;
  home.file.".config/sway/config.d/02-outputs.conf".source = ../config-linux/sway/config.d/02-outputs.conf;
  home.file.".config/sway/config.d/03-inputs.conf".source = ../config-linux/sway/config.d/03-inputs.conf;
  home.file.".config/sway/config.d/04-keybindings.conf".source = ../config-linux/sway/config.d/04-keybindings.conf;
  home.file.".config/sway/config.d/05-visuals.conf".source = ../config-linux/sway/config.d/05-visuals.conf;
  home.file.".config/sway/config.d/06-rules.conf".source = ../config-linux/sway/config.d/06-rules.conf;
  home.file.".config/sway/config.d/07-autostart.conf".source = ../config-linux/sway/config.d/07-autostart.conf;
  home.file.".config/sway/scripts/autotiling.sh".source = ../config-linux/sway/scripts/autotiling.sh;
  home.file.".config/sway/scripts/switch-kb-layout.sh".source = ../config-linux/sway/scripts/switch-kb-layout.sh;
  home.file.".config/sway/scripts/toggle-keyboard.sh".source = ../config-linux/sway/scripts/toggle-keyboard.sh;

  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/home/juan/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "/home/juan/prime-agent/agent";
    ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data";
  };
}
