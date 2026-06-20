#!/usr/bin/env python3
"""
Download model GGUFs for a given machine profile.

Usage:
    python download-models.py laptop
    python download-models.py macbook

HF_HUB_CACHE must be set (or defaults to ~/.cache/huggingface/hub).
On the desktop/laptop set: export HF_HUB_CACHE=/mnt/ai_models/models
"""

import sys
from huggingface_hub import hf_hub_download

LAPTOP = [
    # Vision / multimodal
    ("unsloth/gemma-4-E4B-it-qat-GGUF",    "gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"),
    ("unsloth/gemma-4-E4B-it-qat-GGUF",    "mmproj-BF16.gguf"),
    ("unsloth/gemma-4-E2B-it-qat-GGUF",    "gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"),
    ("unsloth/gemma-4-E2B-it-qat-GGUF",    "mmproj-BF16.gguf"),
    ("unsloth/gemma-4-12B-it-qat-GGUF",    "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"),
    ("unsloth/gemma-4-12B-it-qat-GGUF",    "mmproj-BF16.gguf"),
    ("unsloth/Qwen3.5-9B-MTP-GGUF",        "Qwen3.5-9B-UD-Q4_K_XL.gguf"),
    ("unsloth/Qwen3.5-9B-MTP-GGUF",        "mmproj-BF16.gguf"),
    # Fast / small
    ("LiquidAI/LFM2.5-8B-A1B-GGUF",       "LFM2.5-8B-A1B-Q4_K_M.gguf"),
    ("LiquidAI/LFM2.5-1.2B-Instruct-GGUF", "LFM2.5-1.2B-Instruct-Q4_K_M.gguf"),
    ("unsloth/Qwen3.5-4B-GGUF",            "Qwen3.5-4B-Q8_0.gguf"),
    ("unsloth/Qwen3.5-2B-GGUF",            "Qwen3.5-2B-Q8_0.gguf"),
    ("unsloth/Qwen3.5-0.8B-GGUF",          "Qwen3.5-0.8B-Q8_0.gguf"),
]

MACBOOK = [
    # Vision / multimodal — capped at ~5 GB for 8 GB unified memory
    ("unsloth/gemma-4-E4B-it-qat-GGUF",    "gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"),
    ("unsloth/gemma-4-E4B-it-qat-GGUF",    "mmproj-BF16.gguf"),
    ("unsloth/gemma-4-E2B-it-qat-GGUF",    "gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"),
    ("unsloth/gemma-4-E2B-it-qat-GGUF",    "mmproj-BF16.gguf"),
    # Fast / small — Q4_K_M for 4B to save RAM headroom
    ("LiquidAI/LFM2.5-1.2B-Instruct-GGUF", "LFM2.5-1.2B-Instruct-Q4_K_M.gguf"),
    ("unsloth/Qwen3.5-4B-GGUF",            "Qwen3.5-4B-Q4_K_M.gguf"),
    ("unsloth/Qwen3.5-2B-GGUF",            "Qwen3.5-2B-Q8_0.gguf"),
    ("unsloth/Qwen3.5-0.8B-GGUF",          "Qwen3.5-0.8B-Q8_0.gguf"),
]

PROFILES = {"laptop": LAPTOP, "macbook": MACBOOK}

if len(sys.argv) != 2 or sys.argv[1] not in PROFILES:
    print(f"Usage: {sys.argv[0]} <{'|'.join(PROFILES)}>")
    sys.exit(1)

profile = sys.argv[1]
downloads = PROFILES[profile]
print(f"Downloading {len(downloads)} files for profile: {profile}\n")

for repo, filename in downloads:
    print(f"  {repo}/{filename}")
    path = hf_hub_download(repo_id=repo, filename=filename)
    print(f"    -> {path}")

print(f"\nDone. {len(downloads)} files downloaded.")
