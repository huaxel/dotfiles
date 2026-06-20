# Local model lineup — quality × speed

Reference sheet for the models served via `models.ini` on this Strix Halo box
(Ryzen AI Max 395, Radeon 8060S / RADV, ~62 GB usable RAM, Vulkan backend).

- **AA Index** = Artificial Analysis Intelligence Index (v4.1 composite; reasoning
  variants). Higher = smarter. Frontier closed models sit ~55–60 for reference.
- **gen / prompt t/s** = measured locally with `llama-bench` (Vulkan0, Q4/Q8 weights,
  `-fa on`, q8_0 KV, `-t 14`). **Raw decode — no MTP speculative decoding**, so the
  MTP rows (⚡) run materially faster in real router use than the number here.
- Benched 2026-06-20; all 20 load and run on GPU one-at-a-time.

| Model | Type (active) | Quant | AA Index | gen t/s | prompt t/s | Verdict |
|---|---|---|---:|---:|---:|---|
| Qwen3.6-27B-MTP ⚡👁 | 27B dense | Q4_K_M | 37 | 12.8 | 289 | keep — quality ceiling (slow) |
| Qwen3.5-27B-Uncensored | 27B dense FT | Q4_K_M | ~34¹ | 13.0 | 289 | keep — uncensored niche |
| Qwen3.6-35B-A3B-MTP ⚡ | 35B MoE (3B) | Q4_K_M | 32 | 63.3 | 1050 | ⭐ daily driver |
| gemma-4-31B-qat 👁 | 31B dense | Q4 QAT | 29 | 12.3 | 261 | keep — vision (slow) |
| gemma-4-26B-A4B-qat 👁 | 26B MoE (4B) | Q4 QAT | 26 | 71.9 | 1264 | ⭐ daily driver + vision |
| Qwen3.5-9B-MTP ⚡👁 | 9B dense | Q4_K_XL | 25 | 37.2 | 994 | keep — fast vision |
| GLM-4.7-Flash | MoE | Q4_K_XL | 23 | 69.8 | 953 | keep |
| gemma-4-12B-qat 👁 | 12B dense | Q4 QAT | 22 | 29.7 | 728 | keep — lighter vision |
| Apriel-1.6-15b-Thinker | 15B dense | Q4_K_M | 21 | 25.4 | 689 | keep — reasoning |
| Qwen3.5-4B 👁 | 4B dense | Q8_0 | 20 | 44.6 | 1833 | ⭐ best small-fast |
| gemma-4-E4B-qat 👁 | ~8B edge | Q4 QAT | 19 | 65.3 | 2050 | keep — fast vision |
| gpt-oss-20b | 20B MoE | Q4_K_M | 15 | 86.1 | 1519 | keep — fast |
| gemma-4-E2B-qat 👁 | ~5B edge | Q4 QAT | 15 | 114.9 | 3318 | keep — lightest vision |
| Qwen3.5-2B 👁 | 2B dense | Q8_0 | ~10 | 95.4 | 4407 | keep — tiny |
| LFM2.5-8B-A1B | 8B hybrid (1B) | Q4_K_M | 8 | 170.6 | 2956 | keep — fastest substantial |
| LFM2.5-1.2B | 1.2B hybrid | Q4_K_M | 8 | 251.9 | 6723 | keep — fastest |
| Qwen3.5-0.8B 👁 | 0.8B dense | Q8_0 | ~5 | 195.8 | 8857 | keep — sub-1B |
| SmolLM3-3B | 3B dense | Q4_K_XL | n/a | 97.0 | 2865 | optional |
| zed-industries_zeta-2 | ~7B code-edit | Q4_K_M | n/a² | 43.4 | 1216 | keep IF using Zed edit prediction |
| chandra-ocr-2 👁 | OCR/vision | Q4_K_M | n/a² | 67.0 | 1923 | keep IF doing OCR |

¹ Fine-tune; AA scores the Qwen3.5-27B base. ² Not a chat model — AA doesn't
apply (code-edit / OCR are purpose-built; a low/absent AA score ≠ low utility).

⚡ = MTP speculative decoding (faster in real use)  👁 = vision (mmproj)  ⭐ = recommended daily driver

## Curation summary

- **Daily drivers (best quality-per-speed):** Qwen3.6-35B-A3B and gemma-4-26B-A4B
  — MoEs giving near-top quality at ~5× the speed of the dense 27–31B models.
- **Quality ceiling (slow, use when it matters):** Qwen3.6-27B, Qwen3.5-27B-Uncensored, gemma-4-31B (~12–13 t/s).
- **Small-fast:** Qwen3.5-4B (best quality) or LFM2.5-1.2B (fastest at 252 t/s).
- **Vision tier:** gemma-4-E2B (lightest, 115 t/s) → E4B → 12B → 26B-A4B → 31B. Plus Qwen3.5 series (0.8B–9B) all have mmproj.
- **Specialized (keep by workflow):** zeta-2 (Zed edits), chandra-ocr (OCR).
- **Shared laptop/macbook basis:** Qwen3.5 0.8B–9B, gemma-4-E2B/E4B/12B, LFM2.5-1.2B/8B.
