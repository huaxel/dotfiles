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
  # Niri (replaces sway on this host): Alt-based binds mirror sway so
  # muscle memory carries over. Validate on the host after switching:
  # `niri validate` and `niri msg outputs` (connector names / positions).
  home.file.".config/niri/config.kdl".source = ../config-linux/niri/config.kdl;
  # Host-specific: the WSL/Sway profile must not inherit Niri's backend choice.
  home.file.".config/xdg-desktop-portal/portals.conf".source = ../config-linux/niri/portals.conf;
  home.file.".config/niri/scripts/gather-workspaces.sh".source = ../config-linux/niri/scripts/gather-workspaces.sh;

  # Bar experiment (2026-10-24): Noctalia replaces waybar.
  # (Trayscale removed 2026-10-26: 0.19.0 incompatible with tailscaled 1.104,
  # tray stayed empty; manage Tailscale via CLI.) Revert = drop these,
  # uncomment waybar in config-linux/niri/config.kdl.
  home.packages = lib.optionals (noctaliaPackage != null) [ noctaliaPackage ]
    ++ lib.optionals (nixGLIntelPackage != null) [ nixGLIntelPackage ];

  home.file.".config/llama.cpp/models-laptop.ini".source = ../config/llama.cpp/models-laptop.ini;

  home.sessionVariables = {
    HF_HOME = "/mnt/ai_models";
    HF_HUB_CACHE = "/mnt/ai_models/models";
    # LLAMA_*/MEMORYFIELD_* live in config/environment.d/10-dotfiles.conf
    # (deployed by home/common.nix, loaded via systemd + both shells).
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/home/juan/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "${home}/prime-agent/agent";
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
