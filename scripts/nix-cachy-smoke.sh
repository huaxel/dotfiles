#!/usr/bin/env bash
# Run a small isolated inference request through the pinned Nix CachyLLama build.
# This never stops or replaces the live llama.cpp service.
set -euo pipefail

profile="${1:-qwen-0.8b}"
port="${2:-18123}"
requested_model="${3:-}"
log="${TMPDIR:-/tmp}/nix-cachy-inference-${profile}-${port}.log"
response="${TMPDIR:-/tmp}/nix-cachy-completion-${profile}-${port}.json"
pkg=$(nix eval --raw '.#legacyPackages.x86_64-linux.cachyLlamaVulkan')
nix build '.#legacyPackages.x86_64-linux.cachyLlamaVulkan' --no-link --quiet

case "$profile" in
    qwen-0.8b)
        model_pattern='Qwen3.5-0.8B-Q8_0.gguf'
        alias='nix-cachy-qwen-0.8b'
        ;;
    qwen-2b)
        model_pattern='Qwen3.5-2B-Q8_0.gguf'
        alias='nix-cachy-qwen-2b'
        ;;
    qwen-4b)
        model_pattern='Qwen3.5-4B-Q8_0.gguf'
        alias='nix-cachy-qwen-4b'
        ;;
    lfm-1.2b)
        model_pattern='LFM2.5-1.2B-Instruct-Q4_K_M.gguf'
        alias='nix-cachy-lfm-1.2b'
        ;;
    router-preset)
        model_pattern=''
        alias="${requested_model:-Qwen3.5-0.8B}"
        ;;
    *)
        echo "Unknown smoke-test profile: $profile" >&2
        echo "Choose qwen-0.8b, qwen-2b, qwen-4b, lfm-1.2b, or router-preset" >&2
        exit 2
        ;;
esac

if [ -z "$requested_model" ]; then
    requested_model="$alias"
fi

if [ -n "$model_pattern" ]; then
    model=$(find -L /mnt/ai_models/models -type f -name "$model_pattern" -print -quit)
    if [ -z "$model" ]; then
        echo "No $model_pattern smoke-test model found under /mnt/ai_models" >&2
        exit 1
    fi
    model_args=("LLAMA_ARG_MODEL=$model")
else
    preset="$HOME/.config/llama.cpp/models.ini"
    if [ ! -f "$preset" ]; then
        echo "No generated router preset found at $preset" >&2
        exit 1
    fi
    model_args=(
        "LLAMA_ARG_MODELS_PRESET=$preset"
        LLAMA_ARG_MODELS_AUTOLOAD=true
        LLAMA_ARG_MODELS_MAX=1
    )
fi
: > "$log"

env_args=(
    "${model_args[@]}"
    LLAMA_ARG_HOST=127.0.0.1
    "LLAMA_ARG_PORT=$port"
    LLAMA_ARG_CTX_SIZE=2048
    LLAMA_ARG_N_GPU_LAYERS=all
    LLAMA_ARG_DEVICE=Vulkan0
    "LLAMA_ARG_UI_CONFIG_FILE=$HOME/.config/llama.cpp/webui-config.json"
    LLAMA_ARG_UI_MCP_PROXY=true
    LLAMA_ARG_TOOLS=all
    LLAMA_ARG_ENDPOINT_METRICS=1
    LLAMA_ARG_FLASH_ATTN=on
    LLAMA_ARG_JINJA=true
    LLAMA_ARG_REASONING=off
    LLAMA_ARG_THREADS=4
    LLAMA_ARG_THREADS_BATCH=8
    LLAMA_ARG_BATCH=512
    LLAMA_ARG_UBATCH=128
)

setsid env "${env_args[@]}" \
    nix run --impure '.#legacyPackages.x86_64-linux.nixVulkanIntel' -- \
    "$pkg/bin/llama-server" >"$log" 2>&1 &
server_pid=$!

cleanup() {
    status=$?
    kill -- -"$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    if (( status != 0 )); then
        echo "Nix CachyLLama smoke test failed; server log:" >&2
        tail -80 "$log" >&2 || true
    fi
    exit "$status"
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
        ready=1
        break
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
        exit 1
    fi
    sleep 1
done
if (( ready == 0 )); then
    echo "Nix CachyLLama server did not become ready" >&2
    exit 1
fi

curl -fsS "http://127.0.0.1:${port}/v1/chat/completions" \
    -H 'content-type: application/json' \
    -d "{\"model\":\"$requested_model\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: nix smoke ok\"}],\"max_tokens\":32,\"temperature\":0,\"reasoning_format\":\"none\"}" \
    >"$response"

python3 - "$response" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    payload = json.load(stream)
message = payload["choices"][0]["message"]
text = message.get("content") or message.get("reasoning_content") or ""
if not text.strip():
    raise SystemExit("empty completion")
print(f"completion: {text.strip()}")
PY

echo "✅ isolated Nix GPU inference passed"
