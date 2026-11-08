{ ... }:

{
  imports = [ ./linux-desktop.nix ];

  # Terminal-only host: no compositor mappings. framearch owns niri;
  # shared desktop helpers (lock, waybar, wofi) stay dormant here.

  home.sessionVariables = {
    # Use the system-wide Rex server (systemd, tailnet host wsl-rex) instead of
    # autostarting a personal server. Requires membership in the `rex` group.
    REX_SERVER = "/run/rex/server.sock";
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/home/juan/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "/home/juan/prime-agent/agent";
    ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data";
  };
}
