# Local llama.cpp configuration

This directory contains the local model presets, download helpers, and
platform-specific startup files used by the dotfiles setup.

- [`MODELS.md`](MODELS.md) — benchmarked model lineup and recommendations
- `models-*.ini` — host-specific model presets
- `download-models.py` — model download helper
- `start-server.ps1` — Windows server launcher

The active Unix configuration is rendered from the root
[`llama-models.ini`](../../llama-models.ini) template.
