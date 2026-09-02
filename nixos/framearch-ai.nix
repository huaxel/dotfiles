{ config, lib, pkgs, ... }:

let
  cfg = config.services.juan.framearchAi;
  userHome = if cfg.homeDirectory == null then "/home/${cfg.user}" else cfg.homeDirectory;
  routerEnvironment = {
    HIP_VISIBLE_DEVICES = "-1";
    LLAMA_ARG_HOST = cfg.routerHost;
    LLAMA_ARG_PORT = toString cfg.routerPort;
    LLAMA_ARG_MODELS_PRESET = cfg.modelsPreset;
    LLAMA_ARG_UI_CONFIG_FILE = cfg.uiConfig;
    LLAMA_ARG_UI_MCP_PROXY = "true";
    LLAMA_ARG_TOOLS = "all";
    LLAMA_ARG_ENDPOINT_METRICS = "1";
    LLAMA_ARG_THREADS = "14";
    LLAMA_ARG_THREADS_BATCH = "28";
    LLAMA_ARG_BATCH = "4096";
    LLAMA_ARG_UBATCH = "1024";
    LLAMA_ARG_N_PARALLEL = "1";
    LLAMA_ARG_CACHE_REUSE = "256";
    LLAMA_ARG_CACHE_IDLE_SLOTS = "off";
    LLAMA_ARG_CACHE_TYPE_K = "q8_0";
    LLAMA_ARG_CACHE_TYPE_V = "q8_0";
    LLAMA_ARG_SLOT_PROMPT_SIMILARITY = "0.20";
    LLAMA_ARG_KV_UNIFIED = "1";
  } // cfg.extraEnvironment;
  environment = lib.mapAttrsToList (name: value: "${name}=${value}") routerEnvironment;
  serverExecutable = if cfg.package == null then cfg.executable else "${cfg.package}/bin/llama-server";
  embeddingScript = pkgs.writeShellScript "framearch-llama-embedding" ''
    set -eu
    attempts=0
    while [ "$attempts" -lt 30 ]; do
      ip="$(${lib.getExe pkgs.tailscale} ip -4 2>/dev/null || true)"
      if [ -n "$ip" ]; then
        exec ${serverExecutable} \
          --hf-repo nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0 \
          --embedding --pooling mean \
          --host "$ip" \
          --port ${toString cfg.embeddingPort} \
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
  options.services.juan.framearchAi = {
    enable = lib.mkEnableOption "the framearch llama.cpp AI services";

    user = lib.mkOption {
      type = lib.types.str;
      default = "juan";
      description = "User running the GPU-backed llama services.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "users";
      description = "Primary group for the GPU-backed llama services.";
    };

    package = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      default = null;
      description = "Nix-built llama package; null keeps the external executable path.";
    };

    executable = lib.mkOption {
      type = lib.types.str;
      default = "/opt/cachy-llama/bin/llama-server";
      description = "External llama-server executable used when package is null.";
    };

    homeDirectory = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Home directory for the service user; defaults to /home/<user>.";
    };

    modelsPreset = lib.mkOption {
      type = lib.types.str;
      default = "${userHome}/.config/llama.cpp/models.ini";
      description = "Rendered machine-specific model preset.";
    };

    uiConfig = lib.mkOption {
      type = lib.types.str;
      default = "${userHome}/.config/llama.cpp/webui-config.json";
      description = "sops-nix-provisioned Web UI configuration.";
    };

    routerHost = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
    };

    routerPort = lib.mkOption {
      type = lib.types.port;
      default = 8000;
    };

    embeddingPort = lib.mkOption {
      type = lib.types.port;
      default = 8001;
    };

    extraEnvironment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      description = "Machine-specific environment overrides for llama-server.";
    };

    enableEmbedding = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Run the embedding endpoint alongside the router.";
    };

    enablePortForward = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Expose the explicitly configured HTTP port forwarder.";
    };

    portForwardTarget = lib.mkOption {
      type = lib.types.str;
      default = "192.168.1.138:32657";
      description = "Destination for the optional socat HTTP forwarder.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services."llama.cpp" = {
      description = "llama.cpp Server (framearch)";
      after = [ "network.target" "local-fs.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        SupplementaryGroups = [ "render" "video" "audio" ];
        WorkingDirectory = userHome;
        Environment = environment;
        ExecStart = serverExecutable;
        Restart = "always";
        TimeoutStopSec = 120;
      };
    };

    systemd.services.memoryfield-embed = lib.mkIf cfg.enableEmbedding {
      description = "Memoryfield llama.cpp embedding server";
      after = [ "network-online.target" "tailscaled.service" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        SupplementaryGroups = [ "render" "video" "audio" ];
        WorkingDirectory = userHome;
        ExecStart = embeddingScript;
        Restart = "always";
        RestartSec = 5;
      };
    };

    systemd.services.port-forward-llama = lib.mkIf cfg.enablePortForward {
      description = "Port forward HTTP to the llama reverse proxy";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        User = cfg.user;
        Group = cfg.group;
        ExecStart = "${lib.getExe pkgs.socat} TCP-LISTEN:80,fork,reuseaddr TCP:${cfg.portForwardTarget}";
        AmbientCapabilities = [ "CAP_NET_BIND_SERVICE" ];
        CapabilityBoundingSet = [ "CAP_NET_BIND_SERVICE" ];
        NoNewPrivileges = true;
        Restart = "always";
        RestartSec = 5;
      };
    };
  };
}
