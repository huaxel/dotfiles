# Session Storage Audit — Findings

**Date:** 2026-07-24
**Branch:** `research/session-storage-audit`
**Total storage audited:** 522 MB (228 MB dotfiles + 294 MB ~/.pi)

---

## 1. Overview

Session storage is split across two locations:

| Location | Path | Size | Dirs | Files |
|---|---|---|---|---|
| Dotfiles | `~/dotfiles/pi/agent/sessions/` | 228 MB | 43 | 343 |
| Pi (user) | `~/.pi/agent/sessions/` | 294 MB | 46 | 448 |
| **Total** | | **522 MB** | **89** | **791** |

File type: 100% New Line Delimited JSON (`.jsonl`) — session logs written by the Pi agent framework.

---

## 2. Dotfiles Session Breakdown (`~/dotfiles/pi/agent/sessions/`)

### 2.1 Project Categories

| Category | Size | Directories | % of total |
|---|---|---|---|
| **project-atom (core)** | 75 MB | 2 | 33% |
| **project-atom (herdr worktrees)** | 138 MB | 35 | 61% |
| **dotfiles** | 13 MB | 1 | 6% |
| **roi-tracker** | 608 KB | 1 | <1% |
| **home (misc)** | 216 KB | 1 | <1% |
| **cross-platform** | 3.3 MB | 3 | 1% |
| **Total** | **228 MB** | **43** | |

### 2.2 Core Projects (non-worktree)

| Project | Size | Sessions | File count | Date range |
|---|---|---|---|---|
| `--home-juan-project-atom--` | 21 MB | 21 | 22 | Jul 14 – Jul 24 |
| `--home-juan-project-atom-python--` | 54 MB | 41 | 52 | Jul 14 – Jul 24 |
| `--home-juan-dotfiles--` | 13 MB | 98 | 104 | Jul 13 – Jul 24 |

### 2.3 Top 5 Largest Worktree Sessions

| Session dir | Size | Notes |
|---|---|---|
| `eht-matching` | 25 MB | 12 sessions |
| `worktree-green-stone-9a33` | 23 MB | 7 sessions |
| `batch8-review` | 9.2 MB | 7 sessions |
| `working-dir` | 7.5 MB | 3 sessions |
| `soundness-etde` | 7.5 MB | 3 sessions |

### 2.4 Date Distribution

- **All sessions:** Jul 13 – Jul 24 (11-day span)
- **Files > 7 days old:** 155 files
- **Files > 14 days old:** 0
- **Files > 30 days old:** 0
- All dotfiles sessions are relatively recent (none older than 11 days).

---

## 3. Pi Session Breakdown (`~/.pi/agent/sessions/`)

### 3.1 Project Categories

| Category | Size | Directories | % of total |
|---|---|---|---|
| **project-atom (core)** | 214 MB | 2 | 73% |
| **project-atom (herdr worktrees)** | 58 MB | 34 | 20% |
| **dotfiles** | 5.4 MB | 1 | 2% |
| **home (misc)** | 6.7 MB | 1 | 2% |
| **roi-tracker** | 3.1 MB | 1 | 1% |
| **cross-platform** | 6.5 MB | 4 | 2% |
| **misc (cache, config)** | 0.8 MB | 3 | <1% |
| **Total** | **294 MB** | **46** | |

### 3.2 Core Projects

| Project | Size | Sessions | File count | Date range |
|---|---|---|---|---|
| `--home-juan-project-atom--` | 121 MB | 159 | 164 | Apr 27 – Jul 13 |
| `--home-juan-project-atom-python--` | 94 MB | 112 | 115 | May 27 – Jul 10 |
| `--home-juan-dotfiles--` | 5.4 MB | 42 | 42 | Jun 12 – Jul 13 |
| `--home-juan--` | 6.7 MB | 28 | 30 | Jul 1 – Jul 11 |

### 3.3 Date Distribution

- **Earliest:** Apr 27, 2026 (~88 days old)
- **Latest:** Jul 13, 2026
- **Files > 30 days old:** 281 files (~183 MB)
- **Files > 14 days old:** 365 files
- **Files > 7 days old:** 448 files (all of them)

### 3.4 Key Storage Drivers

- `--home-juan-project-atom--` at **121 MB** is the single largest consumer (41% of pi storage). 159 sessions, oldest from 2026-04-27.
- `--home-juan-project-atom-python--` at **94 MB** (32% of pi storage). 112 sessions, oldest from 2026-05-27.

---

## 4. File Structure

### 4.1 Directory Layout

Each project has a flat directory of session entries:

```
<project-dir>/
  <timestamp>_<uuid>.jsonl                     # Top-level session log (NDJSON)
  <timestamp>_<uuid>/                          # Session subdirectory (if subagent runs)
    <8-char-hash>/                             # Agent run hash
      run-N/                                   # Run number (0-based)
        session.jsonl                          # Per-run context (agent conversation)
```

### 4.2 Top-Level JSONL Files

Session files are ISO 8601 timestamped with UUIDs:
- Format: `2026-07-14T09-51-05-130Z_019f6009-87aa-7e2f-86bc-ae5aa66ef9db.jsonl`
- Each line is a JSON event: session start, model changes, messages, tool calls
- Types observed: `session`, `model_change`, `thinking_level_change`, `message` (with role/content)

### 4.3 Per-Run Subdirectories

Some sessions have subdirectories for subagent work:
```
2026-07-14T15-20-01-427Z_019f6136-ae92-73a6-9dc5-4336f4fc498c/
  c4158c4b/
    run-0/
      session.jsonl       # Subagent session content
```

### 4.4 Average File Sizes

- Top-level `.jsonl` files range from 1 KB to 3.9 MB
- Per-run `session.jsonl` files range from 4 KB to 1.9 MB
- The bulk of storage is in the large top-level `.jsonl` files (conversation history)

---

## 5. Duplicate & Orphaned Analysis

### 5.1 Shared Project Directories

7 project directories exist in **both** locations, containing data from the **same projects**:

| Shared dir | Dotfiles size | Pi size | Combined |
|---|---|---|---|
| `--home-juan-project-atom--` | 21 MB | 121 MB | 142 MB |
| `--home-juan-project-atom-python--` | 54 MB | 94 MB | 148 MB |
| `--home-juan-dotfiles--` | 13 MB | 5.4 MB | 18 MB |
| `--home-juan--` | 216 KB | 6.7 MB | 6.9 MB |
| `--home-juan-projects-sub-roi-tracker--` | 608 KB | 3.1 MB | 3.7 MB |
| `--mnt-c-Users-jbenjumeamoreno-atom-data--` | 3.3 MB | 2.4 MB | 5.7 MB |
| `--tmp--` | 12 KB | 8 KB | 20 KB |
| **Total shared** | **~92 MB** | **~233 MB** | **~325 MB** |

**Are these true duplicates?** No — session UUIDs are unique across locations (verified: only 33 shared `session.jsonl` basenames found, all of which are the generic per-run filename, not content duplicates). Both locations contain **distinct session files** for overlapping projects. Removing one copy would lose unique conversation history.

### 5.2 Orphaned Worktree Sessions — THE BIG FINDING

**All** 69 worktree session directories are orphaned:

| Location | Orphaned worktree dirs | Size | Current matching worktrees |
|---|---|---|---|
| Dotfiles | 35 | **138 MB** | 0 |
| Pi | 34 | **58 MB** | 0 |
| **Total** | **69** | **196 MB** | **0** |

Only one worktree exists on disk: `~/.herdr/worktrees/project-atom/budget-engines/` — none of the session directories reference this worktree.

The session directories correspond to worktrees that were created for specific branches/tasks and have since been deleted. The session logs remain.

**Orphaned worktree sessions account for ~38% of total session storage (196 of 522 MB).**

---

## 6. Retention Policy Recommendations

### 6.1 Tiered Retention Model

| Tier | Scope | Retention | Rationale |
|---|---|---|---|
| **T1: Orphaned worktrees** | Any session dir matching `*.herdr-worktrees-*` where the worktree no longer exists on disk | **Immediate prune** | Worktree is gone; sessions have no active project context. Safest category to delete. |
| **T2: Old sessions (> 30 days)** | All session files last modified > 30 days ago | **Auto-prune** | Sessions older than a month are unlikely to be referenced for context resumption. |
| **T3: Stale core project sessions** | Core project sessions (non-worktree) > 14 days with no recent access | **Manual review recommended** | May contain useful context for active branches. Review before bulk delete. |
| **T4: Active sessions (< 7 days)** | Sessions modified within the last week | **Keep** | Likely part of current or recent work. |

### 6.2 Recommended Pruning Strategy

**Phase 1 — Immediate savings (~196 MB)**

Prune all orphaned worktree sessions:
```
# Dry run
find ~/dotfiles/pi/agent/sessions/ -maxdepth 1 -type d -name "*.herdr-worktrees-*"
find ~/.pi/agent/sessions/ -maxdepth 1 -type d -name "*.herdr-worktrees-*"

# Delete (after verification)
find ~/dotfiles/pi/agent/sessions/ -maxdepth 1 -type d -name "*.herdr-worktrees-*" -exec rm -rf {} +
find ~/.pi/agent/sessions/ -maxdepth 1 -type d -name "*.herdr-worktrees-*" -exec rm -rf {} +
```

Savings: **~196 MB** (38% of total)

**Phase 2 — Age-based pruning in pi location (~183 MB)**

Prune sessions > 30 days old from `~/.pi/agent/sessions/`:
```
find ~/.pi/agent/sessions/ -type f -mtime +30 -delete
find ~/.pi/agent/sessions/ -type d -empty -delete  # Clean up empty dirs
```

Savings: **~183 MB** (35% of total)

**Phase 3 — Core project consolidation (manual review)**

The two largest consumers (`project-atom` at 142 MB + `project-atom-python` at 148 MB = 290 MB combined) have sessions spanning from April through July. Consider:
- Keeping only the last 14-30 days of sessions per project
- Limiting total sessions per project to 50-100 max (vs current 159 for project-atom)

### 6.3 Automated Pruning Script

A `pi-prune-sessions` command already exists in the dotfiles justfile:
```
just pi-prune-sessions [days=30] [project=dotfiles]
```

Recommend extending this to:
1. Detect and prune orphaned worktree sessions automatically
2. Prune both `~/dotfiles/pi/agent/sessions/` and `~/.pi/agent/sessions/`
3. Add a `--dry-run` flag for safe preview
4. Add a `--min-age` flag (default 30 days)

### 6.4 Safety Considerations

| Risk | Mitigation |
|---|---|
| Losing context from work-in-progress | Only auto-prune sessions > 30 days or orphaned worktrees |
| Sessions spanning multiple days | Prune by last-modified date, not session start date |
| Future reference to completed work | Consider summarizing before deleting (out of scope here) |
| Accidental deletion | Always dry-run first; keep `--dry-run` as default |

---

## 7. Summary: What Can Be Safely Pruned

| Category | Size | Safety | Action |
|---|---|---|---|
| Orphaned worktree sessions (dotfiles) | 138 MB | ✅ Very safe | Immediate delete |
| Orphaned worktree sessions (pi) | 58 MB | ✅ Very safe | Immediate delete |
| Pi sessions > 30 days | 183 MB | ✅ Safe | Auto-prune |
| Dotfiles sessions > 14 days | ~155 files | ⚠️ Review needed | Manual or keep |
| Core project sessions (active) | ~290 MB | ❌ Keep | Retain |
| Subagent artifact `.last-cleanup` | ~26 bytes | ✅ Safe | Already handled |

**Total safe to auto-prune: ~379 MB (73% of total)**

---

## 8. Additional Observations

1. **Dotfiles has much newer sessions** — only 11 days of history (Jul 13–24). This suggests it's the active session location, while `~/.pi` accumulates sessions across longer periods.

2. **session.jsonl is a small fraction** — Per-run `session.jsonl` files account for ~41 MB of the 522 MB total. The bulk is in top-level `.jsonl` conversation logs.

3. **No binary files** — All content is NDJSON text, highly compressible. Current storage could be reduced ~70% with gzip (at the cost of queryability).

4. **`subagent-artifacts/` directories** — Present in pi sessions but empty (only `.last-cleanup` files). No space savings from cleaning these.

5. **Cross-platform sessions are small** — The `--mnt-*` and `--tmp--` directories total < 10 MB and can be pruned by the same age-based policy.

---

## 9. Next Steps

1. **Run Phase 1** (orphaned worktree cleanup) — saves ~196 MB immediately
2. **Run Phase 2** (30-day age pruning in pi) — saves ~183 MB
3. **Configure auto-prune** — integrate into the `just pi-prune-sessions` task
4. **Add session retention config** — consider adding to `~/.pi/config.yml`
5. **Consider gzip compression** for session logs older than 7 days (optional optimization)

---

## Appendix A: Current Active Worktrees

Only one worktree exists:
```
~/.herdr/worktrees/project-atom/budget-engines/
```

All other worktree session dirs (69 total) can be safely cleaned.

## Appendix B: Methodology

All measurements taken with `du`, `find`, and `stat` commands on 2026-07-24. Session UUIDs extracted from filenames using regex `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`. Orphan detection by comparing session directory names against `~/.herdr/worktrees/` contents.
