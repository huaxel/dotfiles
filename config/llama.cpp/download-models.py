#!/usr/bin/env python3
"""
Download model GGUFs and write a ready-to-use models ini.

Usage:
    python download-models.py laptop  [--out PATH]
    python download-models.py macbook [--out PATH]

Downloads all GGUFs for the profile into HF_HUB_CACHE (defaults to
~/.cache/huggingface/hub), then writes a models ini with the correct
paths to --out (default: ~/.config/llama.cpp/models.ini).
"""

import argparse
from pathlib import Path
from huggingface_hub import hf_hub_download, constants

# (repo, filename, ini_section, extra_ini_lines)
# extra_ini_lines: list of "key = value" strings added under the section
LAPTOP = {
    "global": """\
[*]
c = 65536
n-gpu-layers = all
flash-attn = true
jinja = true
; 8C/16T Zen 4: 6 gen threads (avoid hyperthread contention), 12 for batch
threads = 6
threads-batch = 12
batch-size = 4096
ubatch-size = 1024
cache-type-k = q8_0
cache-type-v = q8_0
load-on-startup = false
; Radeon 780M — same Vulkan/RADV stack as desktop Strix Halo
device = Vulkan0
no-mmap = true
""",
    "models": [
        # (section_name, repo, {role: filename}, [extra_lines])
        ("gemma-4-E4B-qat", "unsloth/gemma-4-E4B-it-qat-GGUF",
            {"model": "gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf", "mmproj": "mmproj-BF16.gguf"}, []),
        ("gemma-4-E2B-qat", "unsloth/gemma-4-E2B-it-qat-GGUF",
            {"model": "gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf", "mmproj": "mmproj-BF16.gguf"}, []),
        ("gemma-4-12B-qat", "unsloth/gemma-4-12B-it-qat-GGUF",
            {"model": "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf", "mmproj": "mmproj-BF16.gguf"}, ["c = 131072"]),
        ("Qwen3.5-9B-MTP",  "unsloth/Qwen3.5-9B-MTP-GGUF",
            {"model": "Qwen3.5-9B-UD-Q4_K_XL.gguf", "mmproj": "mmproj-BF16.gguf"},
            ["c = 32768", "spec-type = draft-mtp", "spec-draft-n-max = 3"]),
        ("LFM2.5-8B-A1B",   "LiquidAI/LFM2.5-8B-A1B-GGUF",
            {"model": "LFM2.5-8B-A1B-Q4_K_M.gguf"}, ["fit = false"]),
        ("LFM2.5-1.2B",     "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
            {"model": "LFM2.5-1.2B-Instruct-Q4_K_M.gguf"}, ["fit = false"]),
        ("Qwen3.5-4B",      "unsloth/Qwen3.5-4B-GGUF",
            {"model": "Qwen3.5-4B-Q8_0.gguf", "mmproj": "mmproj-BF16.gguf"}, ["fit = false"]),
        ("Qwen3.5-2B",      "unsloth/Qwen3.5-2B-GGUF",
            {"model": "Qwen3.5-2B-Q8_0.gguf", "mmproj": "mmproj-BF16.gguf"}, ["fit = false"]),
        ("Qwen3.5-0.8B",    "unsloth/Qwen3.5-0.8B-GGUF",
            {"model": "Qwen3.5-0.8B-Q8_0.gguf", "mmproj": "mmproj-BF16.gguf"}, ["fit = false"]),
    ],
}

MACBOOK = {
    "global": """\
[*]
c = 32768
n-gpu-layers = all
flash-attn = true
jinja = true
; M2: 4 performance cores
threads = 4
threads-batch = 8
batch-size = 2048
ubatch-size = 512
cache-type-k = q8_0
cache-type-v = q8_0
load-on-startup = false
; Metal is auto-detected — no device or no-mmap override needed
""",
    "models": [
        # (section_name, repo, {role: filename}, [extra_lines])
        ("LFM2.5-1.2B",     "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
            {"model": "LFM2.5-1.2B-Instruct-Q4_K_M.gguf"}, ["fit = false"]),
        ("gemma-4-E2B-qat", "unsloth/gemma-4-E2B-it-qat-GGUF",
            {"model": "gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf", "mmproj": "mmproj-BF16.gguf"}, []),
        ("Qwen3.5-4B",      "unsloth/Qwen3.5-4B-GGUF",
            {"model": "Qwen3.5-4B-Q4_K_M.gguf"}, []),  # Q4 not Q8 — saves ~1.6 GB on 8 GB
        ("Qwen3.5-2B",      "unsloth/Qwen3.5-2B-GGUF",
            {"model": "Qwen3.5-2B-Q8_0.gguf"}, []),
        ("Qwen3.5-0.8B",    "unsloth/Qwen3.5-0.8B-GGUF",
            {"model": "Qwen3.5-0.8B-Q8_0.gguf"}, []),
    ],
}

PROFILES = {"laptop": LAPTOP, "macbook": MACBOOK}

parser = argparse.ArgumentParser()
parser.add_argument("profile", choices=PROFILES)
parser.add_argument("--out", default=str(Path.home() / ".config/llama.cpp/models.ini"),
                    help="Output ini path (default: ~/.config/llama.cpp/models.ini)")
args = parser.parse_args()

profile = PROFILES[args.profile]
print(f"Profile: {args.profile}  |  HF_HUB_CACHE: {constants.HF_HUB_CACHE}\n")

lines = ["version = 1\n", profile["global"]]
for section, repo, files, extras in profile["models"]:
    print(f"  [{section}] from {repo}")
    section_lines = [f"\n[{section}]"]
    for role, filename in files.items():
        path = hf_hub_download(repo_id=repo, filename=filename)
        print(f"    {role} -> {path}")
        section_lines.append(f"{role} = {path}")
    section_lines.extend(extras)
    lines.append("\n".join(section_lines))

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(lines) + "\n")
print(f"\nWrote {out}")
