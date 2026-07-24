# Health Check Data Sources — Findings

> Branch: `research/health-check-data-sources`
> Date: 2026-07-24
> Investigator: worker subagent

## Overview

This document catalogs all available data sources relevant to a Health Check for the Pi coding agent. Sources are organized by category: **Observability**, **Logs**, **Session Data**, **Configuration**, **Extensions/Packages**, and **Runtime State**.

---

## 1. Observability Data

### 1.1 Dynamic-Footer Observability (`@juanbenjumea/pi-dynamic-footer`)

**Location:** `~/dotfiles/pi/packages/pi-dynamic-footer/` (source)  
**Runtime config:** `~/.pi/agent/observability/settings.json`  
**History:** `~/.pi/agent/observability/history.jsonl` (1.8 KB, 10 records)

The dynamic-footer extension is the primary observability data collector. It captures per-session and per-turn metrics via lifecycle hooks.

#### Settings schema (`settings.json`)

```json
{
  "version": 1,
  "preset": "standard",
  "segments": {
    "modelThink": true,
    "runtime": true,
    "pwd": true,
    "git": true,
    "contextUsage": true,
    "contextProgress": true,
    "contextPercentage": true,
    "contextNumbers": true,
    "tokens": true,
    "tps": true,
    "cost": true,
    "cache": true,
    "turnCount": true,
    "usageBars": true
  },
  "contextZones": {
    "expert": 70,
    "warning": 85
  }
}
```

**Configurable segments:** Each can be toggled on/off. All 14 are currently enabled.

#### Turn-level data (in-session, persisted via `obs-turn` custom entries)

| Field | Type | Description |
|---|---|---|
| `turnIndex` | number | Sequential turn number |
| `inputTokens` | number | Input tokens used |
| `outputTokens` | number | Output tokens generated |
| `cost` | number | Dollar cost of the turn |
| `durationMs` | number | Turn duration in milliseconds |
| `tps` | number | Tokens per second (output/duration) |
| `model` | string | Model ID (e.g. `deepseek-v4-flash`) |

#### Session summary (`history.jsonl` — last 10 sessions persisted)

| Field | Type | Description |
|---|---|---|
| `endedAt` | number | Unix ms timestamp |
| `runtimeMs` | number | Total session duration |
| `turns` | number | Turn count |
| `inputTokens` | number | Total input tokens |
| `outputTokens` | number | Total output tokens |
| `cost` | number | Total cost |
| `model` | string | Model used |
| `cwd` | string | Working directory |
| `branch` | string\|null | Git branch at session end |

#### Footer-rendered data (real-time, not persisted)

| Metric | Source | Description |
|---|---|---|
| Model + thinking level | `ctx.model`, `pi.getThinkingLevel()` | Current model and thinking mode |
| Session runtime | `Date.now() - startTime` | Elapsed session time |
| Git branch | `footerData.getGitBranch()` | Current git branch |
| Git diff stats | `git diff HEAD --numstat` | Added/removed lines count |
| Context usage | `ctx.getContextUsage()` | Current vs max context (percentage + bars) |
| Token totals (in/out) | Accumulated from turn_data | Per-session aggregate |
| Cost total | Accumulated from turn_data | Per-session aggregate |
| Live TPS | `outputTokens / duration` | During streaming |
| Cache read | `totalCacheRead` | Accumulated cache reads |
| Turn count | `turnNumber` | Current turn number |
| Quota usage | `fetchQuota(provider)` | Provider subscription usage bars |

#### Lifecycle hooks capture

| Hook | Data captured |
|---|---|
| `session_start` | Session initialization, settings load |
| `agent_start` | Agent run start timestamp |
| `turn_start` | Turn start timestamp |
| `model_select` | Model change, provider change |
| `before_provider_request` | Service tier detection (fast/priority) |
| `message_update` | Streaming token progress |
| `turn_end` | Turn metrics (tokens, cost, TPS, cache) |
| `agent_end` | Agent summary notification |
| `session_shutdown` | Persist session summary to history.jsonl |

**Relevance to Health Check:** HIGH — primary source of usage metrics, cost tracking, context consumption, and performance data.

---

### 1.2 Quota Provider

**Location:** `~/dotfiles/pi/packages/pi-dynamic-footer/lib/quota-provider.ts`

Fetches subscription quota usage for `opencode-go` and `cline-pass` providers. Uses environment variables or auth.json for credentials. Provider-specific URL patterns:

- `opencode-go`: `https://app.opencode.ai/api/workspaces/{workspaceId}/usage/monthly`
- `cline-pass`: `https://cline-pass.vercel.app/api/usage`

**Relevance to Health Check:** MEDIUM — usage bars in footer, but quota data is ephemeral (not persisted).

---

## 2. Logs

### 2.1 Pi Crash Log

**Location:** `~/.pi/agent/pi-crash.log`  
**Size:** 204 KB, 1,432 lines  
**Content:** 1 terminal crash event captured on 2026-06-26T07:43:18.312Z

The log contains a single crash with the full terminal buffer dump (1,425 rendered lines). The crash happened while running `Qwen3.6-27B-MTP:high` in `/home/juan/project-atom` on branch `main`. Rendered terminal contents show an AI conversation about data matching (AISSJ/SLRB logement matching).

**Structure:**
```
Crash at <ISO timestamp>
Terminal width: <n>
Line <m> visible width: <w>
=== All rendered lines ===
[0] ... [N]  (ANSI-rendered terminal content)
```

**Limitations as a health check data source:**
- Only 1 crash captured (hard to generalize patterns)
- Content is terminal ANSI output, not structured error data
- No stack traces or system-level diagnostics
- **Relevance to Health Check:** LOW — single data point, unstructured.

### 2.2 OpenCode Go Failover Log

**Location:** `~/dotfiles/pi/agent/opencode-go-failover.log`  
**Size:** 472 KB, 10,379 lines  
**Content:** Failover account rotation events

**Event type breakdown:**
| Event | Count | Description |
|---|---|---|
| `using account=sub-2` | 5,587 | Requests routed to secondary account |
| `using account=sub-1` | 4,021 | Requests routed to primary account |
| `env accounts: 0` | 113 | Environment variable accounts check |
| `auth.json path: ...` | 113 | Auth file path logged |
| `account sub-1: key=set, ...` | 113 | Per-account config validation |
| `loaded N account(s)` | 113 | Number of loaded accounts |
| `auth.json accounts: N` | 113 | Auth.json account count |
| `quota-like error on` | 1 | Single reported quota error |

**Log line schema (timestamped ISO):**
```
<ISO timestamp> env accounts: <count>
<ISO timestamp> auth.json path: <path>, keys: <comma-separated>
<ISO timestamp> raw failover accounts: <count>
<ISO timestamp> account <label>: key=<status>, workspace=<status>, cookie=<status>
<ISO timestamp> auth.json accounts: <count>
<ISO timestamp> loaded <count> account(s)
<ISO timestamp> using account=<label>
```

**Relevance to Health Check:** MEDIUM — shows failover frequency and account health, but no performance or error metrics beyond account rotation counts.

---

## 3. Session Data

### 3.1 Dotfiles Sessions (`~/dotfiles/pi/agent/sessions/`)

**Size:** 229 MB, 343 files across 43 directories

Directories are named `--<path-with-hyphens--` corresponding to working directories. Each contains `.jsonl` files named `<ISO-timestamp>_<UUID>.jsonl`.

**Session schema (JSONL, all lines are JSON objects):**

| Event type | Frequency | Key fields |
|---|---|---|
| `session` | 1 per file | `type`, `version` (3), `id` (UUID), `timestamp`, `cwd` |
| `message` | Variable | `type`, `id`, `parentId`, `timestamp`, `message` |
| `custom` | Variable | `type`, `customType`, `data` (arbitrary JSON payload) |
| `model_change` | Variable | `type`, `modelId`, `provider`, `timestamp` |
| `thinking_level_change` | Variable | `type`, `thinkingLevel`, `timestamp` |
| `session_info` | 1 per file | `type`, `name` |

**All keys across all event types:** `type`, `version`, `id`, `timestamp`, `cwd`, `parentId`, `message`, `customType`, `data`, `modelId`, `provider`, `thinkingLevel`, `name`

**Directory count:** 43 (39 unique project worktrees + 4 root paths)

**Top session sizes by directory:**
| Path | Size |
|---|---|
| `--home-juan-project-atom-python--` | 54 MB |
| `--home-juan-.herdr-worktrees-project-atom-eht-matching--` | 25 MB |
| `--home-juan-.herdr-worktrees-project-atom-worktree-green-stone-9a33--` | 23 MB |
| `--home-juan-project-atom--` | 21 MB |
| `--home-juan-dotfiles--` | 13 MB |

### 3.2 Runtime Sessions (`~/.pi/agent/sessions/`)

**Size:** 294 MB, 448 files across 46 directories

Same schema as dotfiles sessions. Slightly larger total and more session directories. Contains more recent sessions. The structure is identical.

**Comparison:**

| Property | Dotfiles (`~/dotfiles/pi/agent/sessions/`) | Runtime (`~/.pi/agent/sessions/`) |
|---|---|---|
| Total size | 229 MB | 294 MB |
| Directory count | 43 | 46 |
| File count | 343 | 448 |
| Schema version | 3 | 3 |
| File naming | `<ISO>/<UUID>.jsonl` | `<ISO>/<UUID>.jsonl` |

**Relevance to Health Check:** HIGH — session files contain the complete conversation history including messages, model changes, and custom extension data. File size and aging can indicate problems.

---

## 4. Configuration Files

### 4.1 `settings.json` — Primary Configuration

| Location | File | Size | Notes |
|---|---|---|---|
| Runtime | `~/.pi/agent/settings.json` | 1.4 KB | Active runtime settings (updated recently) |
| Dotfiles | `~/dotfiles/pi/agent/settings.json` | 1.6 KB | Source-of-truth for committed config |

**Key differences (runtime vs dotfiles):**

| Setting | Runtime | Dotfiles |
|---|---|---|
| `lastChangelogVersion` | `0.0.0` | `0.82.0` |
| `defaultProvider` | `null` | `opencode-go` |
| `defaultModel` | `null` | `deepseek-v4-flash` |
| `subagents.defaultModel` | missing | `nan/qwen3.6` |
| `defaultThinkingLevel` | `low` | `high` |
| `enabledModels` | 19 models (includes `cline-pass/*`) | 20 models (includes `opencode/*` free + `commandcode/*`) |
| `packages` | 15 packages (includes `pi-review-loop`, `pi-goal`) | 18 packages (includes `pi-commandcode-provider`, `pi-review`, `pi-auto-permissions`, `pi-dynamic-footer`, `pi-review-loop`, `pi-extension`) |

**Notable:** Runtime settings lacks `subagents`, has older `lastChangelogVersion`, and different packages list. This suggests the runtime is configured separately and may not always match the dotfiles source of truth.

### 4.2 `models.json` — Model Provider Definitions

| Location | File | Size | Notes |
|---|---|---|---|
| Runtime | `~/.pi/agent/models.json` | 22 B | Empty/trivial — `{"providers": {}}` |
| Dotfiles | `~/dotfiles/pi/agent/models.json` | 1.7 KB | Defines `nan` provider with 5 models |

**Dotfiles models defined:**
- `nan/deepseek-v4-flash` (1M ctx, reasoning)
- `nan/mimo-v2.5` (1M ctx, reasoning, text+image)
- `nan/glm5.2` (262K ctx, reasoning)
- `nan/qwen3.6` (262K ctx, reasoning, text+image, qwen thinking format)
- `nan/gemma4` (262K ctx, reasoning, text+image)

### 4.3 `models-store.json` — Full Model Store

**Location:** `~/dotfiles/pi/agent/models-store.json`  
**Size:** 262 KB, 10,161 lines

Full model catalog auto-generated by pi. Contains extensive model definitions with pricing, context windows, capabilities, and compatibility flags for all configured providers (opencode-go, openai-codex, etc.).

**Relevance to Health Check:** MEDIUM — useful for validating model availability/capabilities but auto-generated.

### 4.4 `auth.json` — Authentication Credentials

| Location | File | Size | Notes |
|---|---|---|---|
| Runtime | `~/.pi/agent/auth.json` | 3.2 KB | JWT tokens, API keys |
| Dotfiles | `~/dotfiles/pi/agent/auth.json` | 4.2 KB | Same keys + failover config + commandcode |

**Providers configured:**
- `github-copilot` (OAuth, free educational)
- `openai-codex` (OAuth, plus plan)
- `opencode` (API key)
- `opencode-go` (API key)
- `openrouter` (API key)
- `umans` (OAuth)
- `quota-status.opencode-go` (workspace + cookie)
- `opencode-go-failover` (2 accounts: sub-1, sub-2)
- `commandcode` (OAuth, dotfiles only)

**Relevance to Health Check:** HIGH — token expiry dates critical for health. Expired tokens cause auth failures.

### 4.5 `trust.json` — Trusted Paths

| Location | File | Size |
|---|---|---|
| Runtime | `~/.pi/agent/trust.json` | 173 B |
| Dotfiles | `~/dotfiles/pi/agent/trust.json` | 837 B |

**Runtime trusted paths:** 5 directories  
**Dotfiles trusted paths:** 13 directories (includes worktrees, WSL mount)

**Relevance to Health Check:** LOW — static configuration, rarely changes.

### 4.6 Settings Backup

**Location:** `~/dotfiles/pi/agent/settings.json.bak-recovery-20260714-103138`  
**Size:** 1.3 KB  
**Content:** Snapshot of settings at version 0.80.6 with older package list.

**Relevance to Health Check:** LOW — single recovery point.

---

## 5. Extensions

### 5.1 Local Extensions (`~/dotfiles/pi/agent/extensions/`)

| File | Size | Purpose |
|---|---|---|
| `herdr-agent-state.ts` | 7.4 KB | Herdr terminal integration for pane/workspace state |
| `llama-stats.ts` | 18 KB | Local LLM (llama.cpp) stats monitoring |
| `nan.ts` | 3.7 KB | NaN.builders provider integration |
| `opencode-go-failover/index.ts` | 17.7 KB | Account failover rotation for OpenCode Go |
| `pi-llama.ts` | 23.3 KB | Local llamacpp provider with model management |
| `protected-paths.ts` | 1.1 KB | Path protection rules |
| `restart.ts` | 12.3 KB | Session restart/crash recovery |
| `session-name.ts` | 7.1 KB | Session naming UI |
| `subagent/config.json` | 39 B | Subagent tool description mode (`compact`) |
| `subagent-model-watch.ts` | 4 KB | Model selection for subagents |
| `umans-no-server-search.ts` | 1.5 KB | Umans provider server search toggle |

**Relevance to Health Check:**
- `restart.ts` → crash recovery logic
- `llama-stats.ts` → local LLM health metrics
- `opencode-go-failover` → account rotation health
- `herdr-agent-state.ts` → herdr terminal connectivity

### 5.2 NPM Packages (`~/dotfiles/pi/agent/npm/package.json`)

**Total npm size:** 571 MB

| Package | Version | Function |
|---|---|---|
| `@amaster.ai/pi-computer-use` | ^0.1.6 | Computer use capabilities |
| `@ff-labs/pi-fff` | ^0.10.1 | Custom extensions |
| `@juanbenjumea/pi-dynamic-footer` | ^0.1.2 | **Observability footer** |
| `@juicesharp/rpiv-ask-user-question` | ^2.1.0 | User interaction |
| `@juicesharp/rpiv-todo` | ^2.1.0 | Task management |
| `@mjfuertesf/pi-quota-status` | ^0.1.7 | Quota status display |
| `@mobrienv/pi-tidy-tools` | ^0.4.1 | Tidy/cleanup tools |
| `@ogulcancelik/pi-auto-permissions` | ^0.1.3 | Auto permission management |
| `@ogulcancelik/pi-ghostty-theme-sync` | ^0.1.2 | Ghostty theme sync |
| `@ogulcancelik/pi-herdr` | ^0.4.0 | Herdr terminal integration |
| `@plannotator/pi-extension` | ^0.24.2 | Planner extension |
| `@quintinshaw/pi-dynamic-workflows` | ^3.4.1 | Dynamic workflows |
| `pi-autoresearch` | ^1.6.2 | Web research automation |
| `pi-commandcode-provider` | ^0.4.2 | CommandCode provider |
| `pi-intercom` | ^0.6.0 | Cross-session intercom |
| `pi-provider-umans` | ^1.4.1 | Umans provider |
| `pi-subagents` | ^0.35.1 | Subagent delegation |
| `pi-web-access` | ^0.13.0 | Web access tools |

**Relevance to Health Check:** MEDIUM — package versions and node_modules size are relevant. Stale or missing packages cause extension load failures.

---

## 6. Runtime State

### 6.1 Run History (`run-history.jsonl`)

| Location | Size | Records |
|---|---|---|
| Runtime: `~/.pi/agent/run-history.jsonl` | 7 KB | ~25 records |
| Dotfiles: `~/dotfiles/pi/agent/run-history.jsonl` | 16 KB | ~80 records |

**Schema (JSONL):**
```json
{
  "agent": "reviewer|scout|delegate|atom-analyst",
  "task": "Task description string",
  "ts": 1779878735,           // Unix timestamp
  "status": "ok|error",
  "duration": 157894,         // ms
  "exit": 1                   // only on error
}
```

**Agent types seen:** `reviewer`, `scout`, `delegate`, `atom-analyst`  
**Error rate (dotfiles):** ~30% of records have `status: "error"` and `exit: 1`

**Relevance to Health Check:** HIGH — shows subagent success/failure rates and task durations.

### 6.2 Context Prune Settings

**Location:** `~/.pi/agent/context-prune/settings.json`
```json
{
  "enabled": false,
  "showPruneStatusLine": false,
  "summarizerModel": "default",
  "summarizerThinking": "default",
  "pruneOn": "agent-message",
  "remindUnprunedCount": true,
  "batchingMode": "turn"
}
```

Context pruning is currently **disabled**.

**Relevance to Health Check:** MEDIUM — if enabled, could affect context health.

### 6.3 Lesson Extractor

**Location:** `~/.pi/agent/lesson-extractor/`
- `state.json` — 8 analyzed sessions, 89 candidates extracted, 0 promoted
- `candidates.db` — SQLite database of lesson candidates

**Relevance to Health Check:** LOW — learning system, not operational health.

### 6.4 Intercom State

**Location:** `~/.pi/agent/intercom/`
- `broker.pid` — Process ID of running intercom broker (80380)
- `broker.sock` — Unix socket for inter-process communication

**Relevance to Health Check:** LOW — runtime coordination, no health-relevant data.

### 6.5 Skills Directory

**Location:** `~/.pi/agent/skills/`
- 6 skill directories: `brainstorming`, `impeccable`, `lean-ux`, `requesting-code-review`, `systematic-debugging`, `wayfinder`

**Relevance to Health Check:** LOW — static skill files.

### 6.6 Git Cache

| Location | Content |
|---|---|
| `~/.pi/agent/git/github.com/` | Cached repos: `DietrichGebert/ponytail`, `nicobailon`, `samfoy`, `tmustier`, `ttttmr` |
| `~/dotfiles/pi/agent/git/github.com/` | Cached repo: `earendil-works/pi-review-loop` |

**Relevance to Health Check:** LOW — cached git data for extension lookups.

### 6.7 Theme

**Location:** `~/dotfiles/pi/agent/themes/ghostty-sync-b59692fc.json`  
**Size:** ~1 KB  
**Content:** Tokyo Night-based theme (synced from Ghostty terminal).

**Relevance to Health Check:** LOW — purely cosmetic.

### 6.8 Agent Definitions

**Location:** `~/dotfiles/pi/agent/agents/`
- `worker.md` — Worker agent config (model: `nan/qwen3.6`)
- `reviewer.md` — Reviewer agent config (model: `opencode-go/deepseek-v4-flash`, read-only tools)

**Relevance to Health Check:** LOW — agent role definitions.

---

## 7. Comprehensive Data Source Inventory

### Categorized Summary

| Category | Data Source | Location | Size | Health Check Value |
|---|---|---|---|---|
| **Observability** | History (last 10 sessions) | `~/.pi/agent/observability/history.jsonl` | 1.8 KB | ⭐⭐⭐ HIGH |
| **Observability** | Turn metrics (in-memory) | Dynamic-footer session state | Variable | ⭐⭐⭐ HIGH |
| **Observability** | Settings | `~/.pi/agent/observability/settings.json` | 436 B | ⭐⭐ MEDIUM |
| **Observability** | Quota usage (ephemeral) | `pi-dynamic-footer/lib/quota-provider.ts` | N/A | ⭐⭐ MEDIUM |
| **Logs** | Crash dump | `~/.pi/agent/pi-crash.log` | 204 KB | ⭐ LOW |
| **Logs** | Failover rotation | `~/dotfiles/pi/agent/opencode-go-failover.log` | 472 KB | ⭐⭐ MEDIUM |
| **Sessions** | Dotfiles sessions | `~/dotfiles/pi/agent/sessions/` | 229 MB | ⭐⭐⭐ HIGH |
| **Sessions** | Runtime sessions | `~/.pi/agent/sessions/` | 294 MB | ⭐⭐⭐ HIGH |
| **Config** | Runtime settings | `~/.pi/agent/settings.json` | 1.4 KB | ⭐⭐⭐ HIGH |
| **Config** | Dotfiles settings | `~/dotfiles/pi/agent/settings.json` | 1.6 KB | ⭐⭐⭐ HIGH |
| **Config** | Models config | `~/dotfiles/pi/agent/models.json` | 1.7 KB | ⭐⭐ MEDIUM |
| **Config** | Model store (auto) | `~/dotfiles/pi/agent/models-store.json` | 262 KB | ⭐⭐ MEDIUM |
| **Config** | Auth tokens | `~/.pi/agent/auth.json`, `~/dotfiles/pi/agent/auth.json` | ~4 KB each | ⭐⭐⭐ HIGH |
| **Config** | Trusted paths | `trust.json` (both) | 173 B / 837 B | ⭐ LOW |
| **Config** | Settings backup | `settings.json.bak-*` | 1.3 KB | ⭐ LOW |
| **Run History** | Subagent runs | `run-history.jsonl` (both) | 7-16 KB | ⭐⭐⭐ HIGH |
| **Extensions** | Local extensions | `~/dotfiles/pi/agent/extensions/` | ~100 KB | ⭐⭐ MEDIUM |
| **Extensions** | NPM packages | `~/dotfiles/pi/agent/npm/` | 571 MB | ⭐⭐ MEDIUM |
| **Runtime** | Context prune settings | `~/.pi/agent/context-prune/settings.json` | 209 B | ⭐ LOW |
| **Runtime** | Intercom PID/socket | `~/.pi/agent/intercom/` | 5 B + socket | ⭐ LOW |
| **Runtime** | Git cache | `~/.pi/agent/git/`, `~/dotfiles/pi/agent/git/` | Variable | ⭐ LOW |

### Total Storage

| Location | Size |
|---|---|
| `~/.pi/agent/` (excluding sessions) | ~212 MB (mostly npm/observability data) |
| `~/.pi/agent/sessions/` | 294 MB |
| `~/dotfiles/pi/agent/` (excluding sessions) | ~773 MB (mostly npm/node_modules at 571 MB) |
| `~/dotfiles/pi/agent/sessions/` | 229 MB |
| **Grand Total** | **~1.5 GB** (session data alone: ~523 MB) |

### Storage Breakdown by Category

| Category | Approx. Size |
|---|---|
| NPM packages (`node_modules`) | ~571 MB |
| Session data (both) | ~523 MB |
| Model store | ~262 KB |
| Crash + failover logs | ~676 KB |
| Configuration (all) | ~25 KB |
| Extensions (source) | ~100 KB |

---

## 8. Key Findings for Health Check Design

### High-Value Signals

1. **Token/Cost Trends** — History.jsonl provides per-session cost, token consumption, and model usage. Can detect cost anomalies or context bloat.

2. **Subagent Run History** — `run-history.jsonl` gives agent-type breakdowns with success/error status and durations. ~30% error rate suggests reliability issues worth monitoring.

3. **Auth Token Expiry** — `auth.json` contains JWT tokens with expiration timestamps. Monitoring expiry prevents unexpected auth failures.

4. **Session Storage Growth** — 523 MB total across both locations, growing with usage. Could indicate the need for session pruning/archival.

5. **Failover Log Patterns** — 10,379 lines in opencode-go-failover.log showing continuous account rotation. Usage ratio sub-2:sub-1 ≈ 1.4:1, suggesting the primary account may be hitting limits often.

### Gaps / Missing Data

1. **No system-level metrics** — No CPU, memory, disk, or network data collected.
2. **No network connectivity checks** — No ping/latency data to LLM providers.
3. **No error rate aggregation** — Errors exist in logs and run history but no aggregated error counter.
4. **No provider latency tracking** — No per-provider response time measurements.
5. **No file system health** — No checks for disk space, inode usage, or permission issues.
6. **No process health** — No monitoring of the pi daemon process itself.
7. **No npm integrity checks** — No validation that node_modules are intact.
8. **No model availability checks** — No automated probes to verify provider endpoints.

### Recommended Health Check Signals

Based on available data sources:

| Signal | Source | How to measure |
|---|---|---|
| Daily API cost | `history.jsonl` | Sum cost for sessions within date range |
| Session error rate | `run-history.jsonl` | Count `status: "error"` / total |
| Token efficiency | `history.jsonl` | Output tokens / input tokens ratio |
| Context utilization | `dynamic-footer` state | Context usage percentage trends |
| Auth token expiry | `auth.json` | Check `expires` timestamps against current time |
| Session storage growth | `sessions/` | Directory size delta over time |
| Failover rate | `opencode-go-failover.log` | Account rotation count per time period |
| Crash frequency | `pi-crash.log` | Parse `Crash at` lines |
| Model distribution | `history.jsonl` | Group by model field |
| Provider distribution | `history.jsonl` | Infer from model prefix |
| npm integrity | `npm/package.json` vs `node_modules` | Check installed vs declared |
