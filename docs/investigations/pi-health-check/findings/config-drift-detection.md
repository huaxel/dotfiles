# Config Drift Detection — Findings

> Branch: `research/config-drift-detection`
> Date: 2026-07-24
> Investigator: worker subagent

## 1. File Map: What to Compare

The following files in `~/dotfiles/pi/agent/` have counterparts (or meaningful absence) in `~/.pi/agent/`:

| # | File | Dotfiles side | Runtime side | Compare? |
|---|------|--------------|--------------|----------|
| 1 | `settings.json` | ✅ Exists | ✅ Exists | **YES** — primary drift surface |
| 2 | `models.json` | ✅ Exists | ✅ Exists | **YES** — provider config |
| 3 | `trust.json` | ✅ Exists | ✅ Exists | **YES** — path trust config |
| 4 | `auth.json` | ✅ Exists | ✅ Exists | **NO** — secrets, volatile |
| 5 | `run-history.jsonl` | ✅ Exists | ✅ Exists | **NO** — append-only log, different per run |
| 6 | `settings.json.bak-recovery-*` | ✅ Backup file | — | **NO** — backup artifact |
| 7 | `extensions/subagent/config.json` | ✅ Exists | ❌ Missing | **YES** — runtime has no equivalent |
| 8 | `models-store.json` | ✅ Exists | ❌ Missing | **NO** — runtime ephemeral data only |
| 9 | `.gitignore` | ✅ Exists | ❌ Missing | **NO** — dotfiles tracking artifact |
| 10 | `*.ts` extensions | ✅ Source | ❌ Runtime packages | **NO** — source vs installed |

### Runtime-only files with no dotfiles counterpart

| File | Significance |
|------|-------------|
| `context-prune/settings.json` | Runtime plugin config (new) |
| `observability/settings.json` | Runtime plugin config (new) |
| `observability/history.jsonl` | Runtime observability data (append-only) |
| `lesson-extractor/state.json` | Runtime learning state (volatile) |
| `lesson-extractor/candidates.db` | Runtime learning state (volatile) |
| `pi-crash.log` | Runtime crash artifact |
| `opencode-go-failover.log` | Runtime failover log |
| `intercom/broker.pid` | Runtime intercom broker PID |

## 2. Drift Definition: What Constitutes Drift

**Drift = difference between dotfiles (the source of truth) and runtime.**

### Drift categories

| Category | Definition | Severity |
|----------|-----------|----------|
| **MISSING_KEY** | Key exists in dotfiles but absent in runtime | `high` |
| **MISSING_FILE** | Config file exists in dotfiles but missing in runtime (e.g. `subagent/config.json`) | `medium` |
| **VALUE_DIFF** | Same key, different value | `high` (critical keys) / `low` (cosmetic) |
| **EXTRA_KEY** | Key exists in runtime but not in dotfiles (runtime-only config) | `info` |
| **EXTRA_FILE** | File exists in runtime but not in dotfiles | `info` |
| **LIST_ORDER** | Array elements same but different order | `info` |
| **MISSING_LIST_ITEM** | Array element in dotfiles not in runtime | `medium` |
| **EXTRA_LIST_ITEM** | Array element in runtime not in dotfiles | `info` |

### Key classifications for severity

From comparing the two `settings.json` files, here are the **critical configuration keys** whose drift matters most:

```
Critical (high severity):
  - defaultProvider        : "opencode-go" vs null  → agent won't auto-select
  - defaultModel           : "deepseek-v4-flash" vs null  → no default model
  - defaultThinkingLevel   : "high" vs "low"  → different reasoning depth
  - enabledModels          : 22 vs 19  → different provider access

Info (low severity):
  - theme                  : "ghostty-sync-b59692fc" = "ghostty-sync-b59692fc"  (already matched)
  - defaults.model         : null = null  (already matched)

Medium severity:
  - packages               : different set of extensions/skills
  - subagents.defaultModel : exists only in dotfiles
```

## 3. JSON Comparison Strategy

### Recommended: Structured key-level diff, NOT raw JSON string diff

**Why not raw string diff (diff -u)?**

Raw `diff -u` on pretty-printed JSON works but is noisy:
- Array order shifts cause cascading line-level diffs even if the set is the same
- Pretty-print whitespace changes create false positives
- No semantic understanding (e.g. `"deepseek-v4-flash" removed` at index 19 looks wrong vs "removed from set")

**Why not raw JSON string diff via `diff` npm package?**

`diff.diffJson()` compares stringified JSON, which inherits the same problems as raw text diff.

### Recommended: Structured JSON path-level comparison

A key-level recursive comparison produces actionable output:

```json
{
  "path": "defaultProvider",
  "type": "changed",
  "from": "opencode-go",
  "to": null
}
```

**Implementation approach:**
- Use a small Node.js script (inline, no new deps needed)
- Recursively walk both JSON objects
- Track path as dot-notation string (e.g. `packages[2]`)
- Group results by type (`added`, `removed`, `changed`)

The inline approach avoids adding new npm dependencies (no `deep-diff`, `jsondiffpatch`, etc. needed). The existing `fast-deep-equal` in the pi npm provides equality checking; the diff logic is ~30 lines of Node.js.

### jq as an alternative

`jq` can also do key-level comparisons:

```bash
# Keys only in dotfiles
jq -r 'keys[]' dot.json | sort > /tmp/dot-keys.txt
jq -r 'keys[]' runtime.json | sort > /tmp/runtime-keys.txt
comm -23 /tmp/dot-keys.txt /tmp/runtime-keys.txt  # only in dotfiles

# Value comparison for a specific key
jq -r '.defaultProvider' dot.json vs runtime.json
```

But jq lacks structured array diffing (set comparison vs positional comparison), so the Node.js approach is preferred for full coverage.

## 4. Fields to Ignore

| Field | Reason |
|-------|--------|
| `lastChangelogVersion` | Internal version tracker, resets on `0.0.0` |
| `auth.json` (any key) | API tokens, OAuth credentials — volatile, sensitive |
| `run-history.jsonl` | Append-only execution log, different every run |
| `pi-crash.log` | Transient crash artifact |
| `opencode-go-failover.log` | Transient failover artifact |
| `observability/history.jsonl` | Runtime telemetry data |
| `lesson-extractor/state.json` | Runtime learning state |
| `lesson-extractor/candidates.db` | Runtime learning state |
| `intercom/broker.pid` | Transient process ID |
| `models-store.json` | Runtime model selection cache (no runtime counterpart) |
| `.gitignore` | Dotfiles repo tracking artifact |

## 5. Report Format

### Recommended: Categorized summary table + structured JSON output

#### Summary table (human-readable):

```
=== Config Drift Report ===
dotfiles: ~/dotfiles/pi/agent/
runtime:  ~/.pi/agent/

CRITICAL (2):
  [value] defaultProvider: "opencode-go" → null
  [value] defaultModel:    "deepseek-v4-flash" → null
  [value] defaultThinkingLevel: "high" → "low"

HIGH (3):
  [list_removed] enabledModels: -3 items (opencode/*, commandcode/*, etc.)
  [list_added]   enabledModels: +0 items
  [list_changed] packages:    multiple changes

MEDIUM (2):
  [key_removed] subagents.defaultModel: "nan/qwen3.6" (key absent in runtime)
  [key_added]   pi-computer-use: {mode: "bundled", ...} (key absent in dotfiles)

INFO (5):
  [file_missing] extensions/subagent/config.json (only in dotfiles)
  [extra_file]   context-prune/settings.json (only in runtime)
  [extra_file]   observability/settings.json (only in runtime)
  ...

Summary: 4 critical, 3 high, 2 medium, 5 info
```

#### Structured JSON output (machine-readable):

```json
{
  "timestamp": "2026-07-24T...",
  "dotfilesPath": "~/dotfiles/pi/agent/",
  "runtimePath": "~/.pi/agent/",
  "drifts": [
    {
      "file": "settings.json",
      "path": "defaultProvider",
      "type": "value_changed",
      "severity": "critical",
      "expected": "opencode-go",
      "actual": null
    },
    ...
  ],
  "summary": {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "info": 5,
    "files_compared": 4,
    "files_differ": 3
  }
}
```

## 6. Existing Diff Tool Options

| Tool | Approach | Pros | Cons |
|------|----------|------|------|
| **Inline Node.js** (30 lines) | Recursive key-level walk | No deps, structured output, array set-aware | Must write |
| **jq** | Shell-based key extraction | Already installed, no deps | No array set-aware diffing |
| **diff -u** | Raw text diff | Already installed, simple | Noisy, positional not set-aware |
| **diff (npm)** | Stringified JSON diff | Available in pi/agent/npm | Still string-level, not semantic |
| **fast-deep-equal (npm)** | Equality check | Available, fast | Only yes/no, no diff detail |
| **deep-diff (npm)** | Separate package | Full JSON diff capability | Not installed, adds dep |
| **jsondiffpatch (npm)** | Structured patch | Rich features | Not installed, heavy dep |

**Recommendation:** Inline Node.js script. Zero new dependencies, ~30 lines, produces structured output suitable for both human reading and programmatic consumption.

## 7. Runtime Staleness Context

### Observed reality

The runtime `~/.pi/agent/settings.json` has `lastChangelogVersion: "0.0.0"` while the dotfiles version has `"0.82.0"`. This strongly suggests the runtime config is a **legacy/stale copy** that was never updated after the dotfiles sync mechanism was established.

Key indicators of staleness:
1. `lastChangelogVersion: "0.0.0"` vs `"0.82.0"` in dotfiles
2. Runtime has `defaultProvider: null`, `defaultModel: null` (unset) while dotfiles has them set
3. Runtime has `defaultThinkingLevel: "low"` (pi default) while dotfiles has `"high"`
4. Runtime missing many packages that dotfiles has (e.g., `@juicesharp/rpiv-todo`, `pi-intercom` present but in different positions, etc.)

### Health check approach

The drift detection **should warn** about this because:
1. The `0.0.0` changelog version is a strong signal of a stale copy
2. `null` values for `defaultProvider` and `defaultModel` mean the agent will prompt for provider/model on every session — a degraded UX
3. This isn't intentional divergence — it's a sync gap

**Recommended behavior:**
- Report all drifts regardless of staleness signal
- Add a special `staleness` warning for files where `lastChangelogVersion` mismatch exceeds a threshold (e.g., > 0.5.0)
- Categorize `lastChangelogVersion` drift as `critical` (indicates the whole config may be stale)
- Suggest running a sync/resync operation

## 8. Proposed Implementation

### `just config-drift` task

```bash
just config-drift [flags...]
```

Flags:
- `--format=json` (default: table)
- `--quiet` (only show non-info drifts)
- `--fix` (flag to indicate future auto-fix capability)
- `--dotfiles=PATH` (override dotfiles path)
- `--runtime=PATH` (override runtime path)

### Node.js script: `bin/config-drift.mjs`

```javascript
#!/usr/bin/env node
// Usage: node bin/config-drift.mjs [--format=json|table] [--quiet]

// Files to compare:
//   settings.json, models.json, trust.json, extensions/subagent/config.json
//
// Runtime-only files reported as info:
//   context-prune/settings.json, observability/settings.json,
//   observability/history.jsonl, lesson-extractor/state.json, etc.
//
// Fields always ignored:
//   lastChangelogVersion (warn if mismatch > threshold),
//   auth.json (entire file),
//   run-history.jsonl, *.log, *.pid, *.db, models-store.json
```

## 9. Example Output (Actual Data)

Running the comparison on the current system shows significant drift:

**Critical drift (agent won't work without intervention):**
- `defaultProvider: "opencode-go" → null` (agent can't auto-select provider)
- `defaultModel: "deepseek-v4-flash" → null` (agent can't auto-select model)

**High drift (missing capabilities):**
- 3 fewer models in `enabledModels` (missing opencode free providers, commandcode provider)
- 6 fewer packages (missing `pi-review`, `pi-auto-permissions`, `pi-dynamic-footer`, `pi-commandcode-provider`, `pi-extension`, `@plannotator/pi-extension`)

**Medium drift:**
- `subagents.defaultModel` key only in dotfiles
- `pi-computer-use` key only in runtime

This confirms that the runtime config is significantly outdated and would cause degraded agent behavior.

## 10. Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Files to compare | `settings.json`, `models.json`, `trust.json`, `extensions/subagent/config.json` | These are the 4 config files that represent agent configuration |
| Drift definition | 7 categories (missing key, value diff, extra key, etc.) | Comprehensive coverage of all diff types |
| JSON comparison | Structured key-level diff (Node.js inline) | No deps, structured output, array set-aware |
| Fields ignored | auth.json, run-history.jsonl, logs, pids, crash logs, observability history | Volatile, sensitive, or append-only data |
| Report format | Categorized summary table + structured JSON output | Human-readable + machine-parseable |
| Tooling | Inline Node.js script (~30 lines) | No new dependencies, leverages existing Node.js runtime |
| Staleness | **Warn** about stale runtime configs | `0.0.0` changelog version + null defaults = degraded UX |
| Severity for staleness | Critical (when `lastChangelogVersion` mismatch > 0.5.0) | Indicates whole config may be stale |