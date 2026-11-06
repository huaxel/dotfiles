# ─────────────────────────────────────────────────────────────────────
# llama.cpp router (llama-server) — packaged build
# Installed to /etc/conf.d/llama.cpp by etc/install-system-config.sh
# ─────────────────────────────────────────────────────────────────────

# Shared settings (threads, batch, GPU, KV cache, etc.)
source /etc/conf.d/llama.cpp.common

# Keep the router single-slot under systemd as well as shell launchers.
LLAMA_ARG_N_PARALLEL=1

# ── Server-specific overrides ───────────────────────────────────────

# Unauthenticated router with tools enabled; retain trusted-Tailscale access.
# UFW currently permits port 8000 on tailscale0 and denies other inbound paths.
LLAMA_ARG_HOST=0.0.0.0
LLAMA_ARG_PORT=8000

# Model routing via models.ini preset
LLAMA_ARG_MODELS_PRESET="/home/juan/.config/llama.cpp/models.ini"
LLAMA_ARG_UI_CONFIG_FILE="/home/juan/.config/llama.cpp/webui-config.json"

# MCP proxy + built-in tools
LLAMA_ARG_UI_MCP_PROXY=true
LLAMA_ARG_TOOLS=all

# Prometheus metrics endpoint (127.0.0.1:8000/metrics) for monitoring
LLAMA_ARG_ENDPOINT_METRICS=1

# Extra args (appended to the server command line)
LLAMA_ARGS=
