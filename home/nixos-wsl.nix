{ config, pkgs, ... }:

let
  home = config.home.homeDirectory;
in
{
  home.username = "juan";
  home.homeDirectory = "/home/juan";

  # Antigravity CLI (agy): nixpkgs carries it, so no manual installer drift.
  home.packages = [ pkgs.antigravity-cli ];

  # Rex: nix-managed binary plus a systemd user unit for the personal server.
  # It keeps running only while the user is logged in unless lingering is on.
  programs.rex.enable = true;
  # ~/.ssh/config is a Home Manager file sourced from dotfiles/ssh_config, so
  # let Rex skip the guard it would otherwise try to append there.
  programs.rex.sshGuard = false;
  services.rex = {
    enable = true;
    tailscale = {
      enable = true;
      hostname = "nixos-wsl-rex";
    };
  };

  # WSL link interfaces advertise a 1280 MTU, below what Tailscale's WireGuard
  # packets need (1360); cap the tunnel MTU so the embedded tailnet node does
  # not fragment. This was the one hand-written bit of the old script drop-in.
  systemd.user.services.rex.Service.Environment = [ "TS_DEBUG_MTU=1200" ];

  # Keep the shared workstation tools and secrets without Arch's Rex service.
  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "${home}/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "${home}/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "${home}/prime-agent/agent";
    ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data";
  };
}
