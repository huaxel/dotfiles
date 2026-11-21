{ config, lib, pkgs, noctaliaPackage ? null, nixGLIntelPackage ? null, ... }:

let
  home = config.home.homeDirectory;
  memoryfieldEmbeddingScript = pkgs.writeShellScript "memoryfield-llama-embedding" ''
    set -eu
    attempts=0
    while [ "$attempts" -lt 30 ]; do
      ip="$(${pkgs.tailscale}/bin/tailscale ip -4 2>/dev/null || true)"
      if [ -n "$ip" ]; then
        exec /opt/cachy-llama/bin/llama-server \
          --hf-repo nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0 \
          --embedding --pooling mean \
          --host "$ip" --port 8001 \
          --threads 8 --batch-size 512
      fi
      attempts=$((attempts + 1))
      sleep 2
    done
    echo "Tailscale IPv4 address did not become available" >&2
    exit 1
  '';
in
{
  imports = [ ./linux-desktop.nix ];

  options.services.juan.framearchUser = {
    enableMemoryfieldEmbed = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Run the Home Manager embedding service; disable when NixOS owns it.";
    };
  };

  config = {
  # rustup (~/.cargo/bin) owns the Rust toolchain here, so per-project
  # rust-toolchain pins apply; see home/nix-rust.nix.
  dotfiles.nixRust.enable = false;

  # Niri: Alt-based binds (see docs/patterns/window-management.md for the
  # cross-OS contract). Validate on the host after switching:
  # `niri validate` and `niri msg outputs` (connector names / positions).
  home.file.".config/niri/config.kdl".source = ../config-linux/niri/config.kdl;
  # Host-specific: the terminal-only WSL profile must not inherit Niri's backend choice.
  home.file.".config/xdg-desktop-portal/portals.conf".source = ../config-linux/niri/portals.conf;
  home.file.".config/niri/scripts/gather-workspaces.sh".source = ../config-linux/niri/scripts/gather-workspaces.sh;

  # Bar experiment (2026-10-24): Noctalia replaces waybar.
  # (Trayscale removed 2026-10-26: 0.19.0 incompatible with tailscaled 1.104,
  # tray stayed empty; manage Tailscale via CLI.) Revert = drop these,
  # uncomment waybar in config-linux/niri/config.kdl.
  home.packages = lib.optionals (noctaliaPackage != null) [ noctaliaPackage ]
    ++ lib.optionals (nixGLIntelPackage != null) [ nixGLIntelPackage ];

  home.file.".config/llama.cpp/models-laptop.ini".source = ../config/llama.cpp/models-laptop.ini;

  # Keep the personal Rex server reachable from the Mac over Tailscale, as
  # framearch-rex. Mirrors home/arch-wsl.nix; without these flags the server
  # listens only on the Unix socket and the tsnet node falls back to the
  # default "rex" name on restart. Enable the unit with
  # `systemctl --user enable rex.service` (not rex.socket: on-demand start
  # leaves the tailnet endpoint dead until something runs locally).
  home.file.".config/systemd/user/rex.service.d/tailscale.conf".text = ''
    [Service]
    ExecStart=
    ExecStart=/usr/bin/rex server run --log-format text --tailscale --tailscale-hostname framearch-rex
  '';

  # Declare the enablement so a fresh build reproduces the always-on model
  # (without it the server only starts on demand and the tailnet endpoint is
  # dead between local sessions). The wants link points at the packaged unit,
  # so Delegate=/KillMode=/OOMPolicy= stay upstream's rather than being
  # shadowed by a hand-written unit.
  home.file.".config/systemd/user/default.target.wants/rex.service" = {
    source = config.lib.file.mkOutOfStoreSymlink "/usr/lib/systemd/user/rex.service";
    # systemctl already created this link pointing at the same unit; without
    # force, activation treats the mismatch as a collision and aborts.
    force = true;
  };

  home.sessionVariables = {
    HF_HOME = "/mnt/ai_models";
    HF_HUB_CACHE = "/mnt/ai_models/models";
    # LLAMA_*/MEMORYFIELD_* live in config/environment.d/10-dotfiles.conf
    # (deployed by home/common.nix, loaded via systemd + both shells).
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/home/juan/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "${home}/prime-agent/agent";
  };

  systemd.user.services.noctalia = lib.mkIf (noctaliaPackage != null && nixGLIntelPackage != null) {
    Unit = {
      Description = "Noctalia desktop shell";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${nixGLIntelPackage}/bin/nixGLIntel ${noctaliaPackage}/bin/noctalia";
      Restart = "always";
      RestartSec = "5s";
    };
    Install.WantedBy = [ "graphical-session.target" ];
  };

  systemd.user.services.memoryfield-embed = lib.mkIf config.services.juan.framearchUser.enableMemoryfieldEmbed {
    Unit = {
      Description = "llama.cpp embedding server for Memoryfield";
      After = [ "network-online.target" ];
      Wants = [ "network-online.target" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${memoryfieldEmbeddingScript}";
      Restart = "on-failure";
      RestartSec = "5s";
    };
    Install.WantedBy = [ "default.target" ];
  };
  };
}
