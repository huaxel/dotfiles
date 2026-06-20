# llama.cpp router (llama-server) environment.
#
# Tracked in dotfiles — installed to /etc/conf.d/llama.cpp by
# etc/install-system-config.sh (requires sudo; dotter only manages user files).
# Read by the packaged llama.cpp.service via EnvironmentFile=.

LLAMA_ARG_HOST=0.0.0.0
LLAMA_ARG_PORT=8000
#LLAMA_ARG_MODELS_DIR="/mnt/ai_models/router-models"
LLAMA_ARG_MODELS_PRESET="/home/juan/.config/llama.cpp/models.ini"
LLAMA_ARG_UI_CONFIG_FILE="/home/juan/.config/llama.cpp/webui-config.json"
LLAMA_ARG_UI_MCP_PROXY=true
LLAMA_ARG_TOOLS=all
# Prometheus metrics endpoint — required by the llama-stats bridge for live
# tok/s (it derives generation speed from llamacpp:n_decode_total).
LLAMA_ARG_ENDPOINT_METRICS=1
# Strix Halo is 16C/32T: 14 threads for generation (avoid hyperthread
# contention — 32 gen threads hurts), 28 for prompt/batch processing.
LLAMA_ARG_THREADS=14
LLAMA_ARG_THREADS_BATCH=28
LLAMA_ARG_BATCH=4096
LLAMA_ARG_UBATCH=1024
LLAMA_ARG_N_PARALLEL=1
LLAMA_ARG_CACHE_REUSE=256
LLAMA_ARG_CACHE_IDLE_SLOTS=off

# Disable ROCm/KFD entirely — prevents amdgpu_vm_cpu_update GPF on Strix Halo.
# Vulkan (RADV) is unaffected; it bypasses KFD completely.
# All models use --device Vulkan0 explicitly via models.ini.
HIP_VISIBLE_DEVICES=-1

LLAMA_ARGS=
