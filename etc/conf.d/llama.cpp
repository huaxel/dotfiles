# ─────────────────────────────────────────────────────────────────────
# llama.cpp router (llama-server) — packaged build
# Installed to /etc/conf.d/llama.cpp by etc/install-system-config.sh
# ─────────────────────────────────────────────────────────────────────

# Shared settings (threads, batch, GPU, KV cache, etc.)
source /etc/conf.d/llama.cpp.common

# ── Server-specific overrides ───────────────────────────────────────

LLAMA_ARG_HOST=0.0.0.0
LLAMA_ARG_PORT=8000

# Model routing via models.ini preset
LLAMA_ARG_MODELS_PRESET="/home/juan/.config/llama.cpp/models.ini"
LLAMA_ARG_UI_CONFIG_FILE="/home/juan/.config/llama.cpp/webui-config.json"

# MCP proxy + built-in tools
LLAMA_ARG_UI_MCP_PROXY=true
LLAMA_ARG_TOOLS=all

# Prometheus metrics — consumed by the stats bridge
LLAMA_ARG_ENDPOINT_METRICS=1

# Extra args (appended to the server command line)
LLAMA_ARGS=
