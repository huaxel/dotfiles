# llama.cpp on Windows

Mirrors the dotfiles config at `~/Documents/dotfiles/`.

## Structure

| Linux dotfiles | Windows equivalent |
|---|---|
| `llama-models.ini` (template) | Rendered per-machine |
| `config/llama.cpp/models-laptop.ini` | Reference for this machine |
| `/etc/conf.d/llama.cpp` | `start-server.ps1` (env vars hardcoded) |
| `config/llama.cpp/stats-bridge.py` | Same file, runs on Windows |
| `pi_extensions/llama-stats.ts` | Same file, works as-is |

## Quick start

```powershell
# Start with default (Qwen3.5-4B MTP)
.\start-server.ps1

# Start with a specific model
.\start-server.ps1 -Model LFM2.5-8B-A1B
.\start-server.ps1 -Model Gemma-4-E2B

# Router mode (no model loaded, auto-discovers HF cache)
.\start-server.ps1 -NoModel

# List available models
.\start-server.ps1 -ShowModels
```

## API examples

```powershell
curl.exe -X POST http://127.0.0.1:8000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{\"model\":\"qwen35\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"temperature\":0}'
```

## PowerShell profile alias

Add to `$PROFILE`:
```powershell
function llama-serve { & "$env:USERPROFILE\.config\llama.cpp\start-server.ps1" @args }
```
Then: `llama-serve -Model LFM2.5-8B-A1B`
