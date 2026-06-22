# llama-server launcher for Windows
# Mirrors the Linux dotfiles llama.cpp setup
#
# Usage:
#   .\start-server.ps1                    # Start with default (Qwen3.5-4B MTP)
#   .\start-server.ps1 -Model LFM2.5-8B-A1B
#   .\start-server.ps1 -ShowModels        # List available models
#   .\start-server.ps1 -NoModel           # Router mode (load on demand)

param(
  [string]$Model = "",
  [switch]$NoModel = $false,
  [switch]$ShowModels = $false
)

# -- Hardware config (mirrors models-laptop.ini globals) --
$LISTEN_ADDR = "127.0.0.1"
$PORT = 8000
$THREADS = 12        # gen threads (avoid HT contention on 8C/16T)
$THREADS_BATCH = 12  # same count for batch
$CTX_SIZE = 65536    # default context
$BATCH = 2048
$UBATCH = 512

# Model paths (your local HF cache)
$CACHE_BASE = "$env:USERPROFILE\.cache\huggingface\hub"
$MODELS = @{
  "Qwen3.5-4B-MTP" = "$CACHE_BASE\models--unsloth--Qwen3.5-4B-MTP-GGUF\snapshots\86835bf9949e4d14d6860f7910b1340ad4f271a9\Qwen3.5-4B-Q4_K_M.gguf"
  "LFM2.5-8B-A1B"  = "$CACHE_BASE\models--LiquidAI--LFM2.5-8B-A1B-GGUF\snapshots\dfd5fdcad7a1c0d31473fb4ca443b8befbacddf0\LFM2.5-8B-A1B-Q4_K_M.gguf"
  "Gemma-4-E2B"    = "$CACHE_BASE\models--unsloth--gemma-4-E2B-it-qat-GGUF\snapshots\db01ae3ceeca98487bf3569814f832f5023cd48c\gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"
  "Gemma-4-E4B"    = "$CACHE_BASE\models--unsloth--gemma-4-E4B-it-qat-GGUF\snapshots\bbcd9d849c2541ecc2af7ef64b3c3c2c7aa14e96\gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
  "LFM2.5-1.2B"    = "$CACHE_BASE\models--LiquidAI--LFM2.5-1.2B-Instruct-GGUF\snapshots\047e06635fbe71469926b35ea414537245218200\LFM2.5-1.2B-Instruct-Q4_K_M.gguf"
  "Qwen3.5-2B"     = "$CACHE_BASE\models--unsloth--Qwen3.5-2B-GGUF\snapshots\f6d5376be1edb4d416d56da11e5397a961aca8ae\Qwen3.5-2B-UD-Q4_K_XL.gguf"
  "Qwen3.5-0.8B"   = "$CACHE_BASE\models--unsloth--Qwen3.5-0.8B-MTP-GGUF\snapshots\cf8a611f6ed2c2060046219a19f12cd3d5ecd67c\Qwen3.5-0.8B-Q4_K_M.gguf"
}

# -- Show models and exit --
if ($ShowModels) {
  Write-Host "Available models:"
  foreach ($key in $MODELS.Keys | Sort-Object) {
    $path = $MODELS[$key]
    $size = (Get-Item $path -ErrorAction SilentlyContinue).Length
    if ($size) {
      $gb = [math]::Round($size / 1GB, 2)
      Write-Host "  $($key.PadRight(20)) $gb GB"
    } else {
      Write-Host "  $($key.PadRight(20)) (not found)"
    }
  }
  exit
}

# -- Select model --
if ($NoModel) {
  $MODEL_PATH = ""
  $MODEL_NAME = "(router mode)"
}
elseif ($Model -ne "" -and $MODELS.ContainsKey($Model)) {
  $MODEL_PATH = $MODELS[$Model]
  $MODEL_NAME = $Model
}
else {
  $MODEL_PATH = $MODELS["Qwen3.5-4B-MTP"]
  $MODEL_NAME = "Qwen3.5-4B-MTP"
}

# -- Build args (mirrors etc/conf.d/llama.cpp + models.ini globals) --
$args_list = @(
  "--host", $LISTEN_ADDR,
  "--port", $PORT,
  "-t", $THREADS,
  "-tb", $THREADS_BATCH,
  "-c", $CTX_SIZE,
  "-b", $BATCH,
  "-ub", $UBATCH,
  "--n-gpu-layers", "999",
  "--flash-attn", "on",
  "--device", "Vulkan0",
  "--cache-type-k", "q8_0",
  "--cache-type-v", "q8_0",
  "--jinja",
  "--metrics"
)

if ($MODEL_PATH) {
  $args_list += "-m", $MODEL_PATH
}

# -- Print startup info --
Write-Host "[llama-server] Model : $MODEL_NAME"
Write-Host "[llama-server] Host  : http://${LISTEN_ADDR}:${PORT}"
Write-Host "[llama-server] GPU   : Vulkan (ngl=999, FA on)"
Write-Host "[llama-server] Ctx   : $CTX_SIZE"
Write-Host "[llama-server] Threads: gen=$THREADS batch=$THREADS_BATCH"

# -- Start llama-server --
$process = Start-Process -FilePath "llama-server" -ArgumentList $args_list -NoNewWindow -PassThru
$process.Id | Out-File -FilePath "$env:TEMP\llama-server.pid"
Write-Host "[llama-server] PID: $($process.Id)"

# -- Wait for readiness --
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://${LISTEN_ADDR}:$PORT/health" -Method Get -TimeoutSec 1 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 1
}

if ($ready) {
  Write-Host "[llama-server] Ready! http://${LISTEN_ADDR}:$PORT/v1/chat/completions"
} else {
  Write-Host "[llama-server] Not ready yet - check http://${LISTEN_ADDR}:$PORT/health"
}

$process.WaitForExit()
