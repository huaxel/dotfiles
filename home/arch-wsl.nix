{ ... }:

{
  imports = [ ./linux-desktop.nix ];

  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PRIME_AGENT_CODING_AGENT_DIR = "/home/juan/dotfiles/prime-agent/agent";
    ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data";
  };
}
