# Headless Pi 5 home server (media, DNS, CI runners). No graphical session,
# so linux-desktop.nix is deliberately not imported.
{ ... }:

{
  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/home/juan/dotfiles/pi/agent/sessions";
  };
}
