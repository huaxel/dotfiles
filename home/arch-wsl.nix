{ config, ... }:

{
  imports = [ ./linux-desktop.nix ];

  # Terminal-only host: no compositor mappings. framearch owns niri;
  # shared desktop helpers (lock, waybar, wofi) stay dormant here.

  # Keep the personal Rex server reachable from the Mac over Tailscale.
  # This is the same per-user server model as Framearch, with Tailnet enabled.
  home.file.".config/systemd/user/rex.service.d/tailscale.conf".text = ''
    [Service]
    ExecStart=
    ExecStart=/usr/bin/rex server run --log-format text --tailscale --tailscale-hostname arch-wsl-rex
  '';

  # Declare the enablement so a fresh build reproduces the always-on model
  # (without it the server only starts on demand and the tailnet endpoint is
  # dead between local sessions). The wants link points at the packaged unit,
  # so Delegate=/KillMode=/OOMPolicy= stay upstream's rather than being
  # shadowed by a hand-written unit.
  home.file.".config/systemd/user/default.target.wants/rex.service".source =
    config.lib.file.mkOutOfStoreSymlink "/usr/lib/systemd/user/rex.service";

  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/home/juan/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "/home/juan/prime-agent/agent";
    ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data";
  };
}
