---
name: quota-aware-models
description: Select models based on quota headroom from the agentq quota tracker. Use when spawning subagents, running workflows, or choosing models to avoid hitting quota limits.
---

# Quota-Aware Model Selection

When choosing models for subagents or workflows, check quota headroom first to avoid hitting limits mid-run.

## Quick Reference

| Tier | Use for | Fallback models |
|------|---------|-----------------|
| `small` | Quick analysis, grep, simple tasks | `nan/gemma4`, `nan/qwen3.6`, `nan/deepseek-v4-flash` |
| `medium` | Code review, moderate reasoning | `nan/mimo-v2.5`, `nan/deepseek-v4-flash`, `cline-pass/deepseek-v4-flash` |
| `big` | Complex synthesis, architecture | `nan/mimo-v2.5`, `cline-pass/deepseek-v4-pro`, `opencode-go/kimi-k2.7-code` |

## Check Headroom

```bash
# Check if a specific model has headroom
cd ~/projects/agentq
node src/lib/quota-resolver.js --check "cline-pass/kimi-k2.7-code" --json

# Resolve a tier to a concrete model with headroom
node src/lib/quota-resolver.js --tier small
node src/lib/quota-resolver.js --tier medium
node src/lib/quota-resolver.js --tier big

# See all tiers at once
node src/lib/quota-resolver.js --all --json
```

## Update Tiers

Before running `agentq drain` or spawning many subagents, refresh the tier config:

```bash
cd ~/projects/agentq
./bin/update-workflow-tiers.sh
```

This writes `~/.pi/workflows/model-tiers.json` which pi-dynamic-workflows reads.

## Rules

1. **Prefer local/free models** — `nan/*`, `llamacpp/*` have unlimited headroom
2. **Check before using paid providers** — `cline-pass/*`, `opencode-go/*`, `umans/*` have weekly quotas
3. **Use tiers, not exact models** — let the resolver pick the best available
4. **Update tiers periodically** — quota windows reset weekly; stale tiers may reject valid models

## Integration with agentq

When using `agentq --workflow`, the executor automatically:
1. Updates tiers before each drain
2. Resolves `auto` model to quota-aware selection
3. Falls back to local models if all paid providers are saturated

## For Manual Subagent Spawns

```bash
# Before spawning subagents, resolve what's available
MODEL=$(node ~/projects/agentq/src/lib/quota-resolver.js --tier medium)
echo "Using: $MODEL"
# Then use this model in your subagent calls
```
