{ config, pkgs, ... }:

let
  home = config.home.homeDirectory;

  # A monospace face is load-bearing here, not cosmetic: this host shipped no
  # mono font at all, so mono requests silently fell back to proportional
  # DejaVu Sans. Anything that lays out a cell grid then mis-measures text.
  monospaceFont = "JetBrainsMono Nerd Font Mono";
in
{
  home.username = "juan";
  home.homeDirectory = "/home/juan";

  # Antigravity CLI (agy): nixpkgs carries it, so no manual installer drift.
  home.packages = [ pkgs.antigravity-cli pkgs.nerd-fonts.jetbrains-mono ];

  # Let Home Manager link the fonts above and write fontconfig for them.
  fonts.fontconfig.enable = true;

  # Written to conf.d rather than fonts.conf so it never collides with the
  # fonts.conf Home Manager generates above.
  home.file.".config/fontconfig/conf.d/99-monospace.conf".text = ''
    <?xml version="1.0"?>
    <!DOCTYPE fontconfig SYSTEM "fonts.dtd">
    <fontconfig>
      <alias binding="same"><family>monospace</family>
        <prefer><family>${monospaceFont}</family></prefer></alias>
      <alias binding="same"><family>DejaVu Sans Mono</family>
        <prefer><family>${monospaceFont}</family></prefer></alias>
      <alias binding="same"><family>JetBrains Mono</family>
        <prefer><family>${monospaceFont}</family></prefer></alias>
    </fontconfig>
  '';

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
