{ config, lib, pkgs, ... }:

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
  home.file.".config/llama.cpp/models-laptop.ini".source = ../config/llama.cpp/models-laptop.ini;
  home.file.".config/llama.cpp/stats-bridge.py".source = ../config/llama.cpp/stats-bridge.py;

  home.sessionVariables = {
    HF_HOME = "/mnt/ai_models";
    HF_HUB_CACHE = "/mnt/ai_models/models";
    LLAMA_BASE_URL = "http://127.0.0.1:8000";
    MEMORYFIELD_EMBED_PROVIDER = "llama-server";
    MEMORYFIELD_EMBED_URL = "http://framearch-juan.bonobo-fort.ts.net:8001/v1/embeddings";
    MEMORYFIELD_EMBED_MODEL = "nomic-embed-text-v1.5";
    MEMORYFIELD_MODEL_CODE = "nomic-embed-text-v1.5";
    PI_CODING_AGENT_DIR = "/home/juan/dotfiles/pi/agent";
    PRIME_AGENT_CODING_AGENT_DIR = "/home/juan/dotfiles/prime-agent/agent";
  };

  systemd.user.services.llama-stats-bridge = {
    Unit = {
      Description = "llamacpp + cachyllama live stats bridge";
      After = [ "network.target" ];
      Wants = [ "network.target" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${pkgs.python3}/bin/python3 ${home}/.config/llama.cpp/stats-bridge.py";
      Restart = "on-failure";
      RestartSec = "5s";
      OOMScoreAdjust = "-400";
      MemoryMax = "256M";
      Environment = [
        "BRIDGE_PORT=55268"
        "LLAMA_SERVERS=llamacpp=http://127.0.0.1:8000,cachyllama=http://127.0.0.1:9092"
      ];
    };
    Install.WantedBy = [ "default.target" ];
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
