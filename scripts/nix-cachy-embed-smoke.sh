#!/usr/bin/env bash
# Validate the future NixOS embedding service in an isolated process.
# This never stops or replaces the live memoryfield-embed service.
set -euo pipefail

port="${1:-18140}"
log="${TMPDIR:-/tmp}/nix-cachy-embed-${port}.log"
response="${TMPDIR:-/tmp}/nix-cachy-embed-${port}.json"
pkg=$(nix eval --raw '.#legacyPackages.x86_64-linux.cachyLlamaVulkan')
nix build '.#legacyPackages.x86_64-linux.cachyLlamaVulkan' --no-link --quiet

: > "$log"
setsid nix run --impure '.#legacyPackages.x86_64-linux.nixVulkanIntel' -- \
    "$pkg/bin/llama-server" \
    --hf-repo 'nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0' \
    --embedding --pooling mean --host 127.0.0.1 --port "$port" \
    --n-gpu-layers all --device Vulkan0 --threads 4 --batch-size 512 \
    >"$log" 2>&1 &
server_pid=$!

cleanup() {
    status=$?
    kill -- -"$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    if (( status != 0 )); then
        echo "Nix CachyLLama embedding test failed; server log:" >&2
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
    echo "Nix CachyLLama embedding server did not become ready" >&2
    exit 1
fi

curl -fsS "http://127.0.0.1:${port}/v1/embeddings" \
    -H 'content-type: application/json' \
    -d '{"model":"nomic-embed-text-v1.5","input":"nix embedding smoke"}' \
    >"$response"

python3 - "$response" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    payload = json.load(stream)
embedding = payload["data"][0]["embedding"]
print(f"embedding dimensions: {len(embedding)}")
if len(embedding) != 768:
    raise SystemExit(f"expected 768 dimensions, got {len(embedding)}")
PY

echo "✅ isolated Nix GPU embedding passed"
