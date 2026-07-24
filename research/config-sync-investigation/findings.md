# Config Sync Investigation

Date: 2026-07-24
Branch: `research/config-sync-investigation`

## Overview

This document maps how the dotfiles pi config (`~/dotfiles/pi/agent/`) relates to
the runtime config (`~/.pi/agent/`), covering the intended sync mechanism, actual
state, drift, and source-of-truth ownership.

## Architecture

### PI_CODING_AGENT_DIR — The Primary Mechanism

Pi discovers its configuration directory via `PI_CODING_AGENT_DIR` environment
variable, set in `~/.config/fish/config.fish`:

```fish
set -x PI_CODING_AGENT_DIR $HOME/dotfiles/pi/agent
```

This causes pi to read its **primary** config from `~/dotfiles/pi/agent/`.

### Config Resolution Priority (from code in pi-shared)

Pi loads `settings.json` with a layered priority (low → high):

1. **Global**: `~/.pi/agent/settings.json` — lowest priority (fallback)
2. **Agent dir**: `$PI_CODING_AGENT_DIR/settings.json` = `~/dotfiles/pi/agent/settings.json`
3. **Project**: `<cwd>/.pi/settings.json` — highest priority (per-project overrides)

Since `PI_CODING_AGENT_DIR` is set, the agent dir (dotfiles copy) takes precedence
over the global `~/.pi/agent/` copy for `settings.json`.

Other config files (`models.json`, `auth.json`, `trust.json`, extensions) are loaded
from `$PI_CODING_AGENT_DIR` and do **not** fall back to `~/.pi/agent/`.

### Git Clean Filter — Machine-Specific Field Stripping

The file `pi/agent/settings.json` has a **git clean filter** configured in
`.gitattributes`:

```
pi/agent/settings.json filter=strip-pi-machine-config
```

Defined in `.git/config`:
```
[filter "strip-pi-machine-config"]
    clean = jq '.lastChangelogVersion = \"0.0.0\" | .defaults.model = null | .defaultModel = null | .defaultProvider = null'
    smudge = cat
```

This means `git add` strips out machine-specific fields (`defaultProvider`,
`defaultModel`, `lastChangelogVersion`) before committing, while the working copy
retains the local machine's preferred defaults. A local Node.js script
(`scripts/strip-pi-machine-config.mjs`) is also referenced in `bootstrap.sh` as
a backup smudge filter (line 62-63).

### Secrets Pipeline

API keys (`auth.json`) are encrypted via **sops** with age, stored as
`secrets/pi-auth.json.enc`. The `.dotter/post_deploy.bash` hook decrypts it to
`$HOME/dotfiles/pi/agent/auth.json` on each deploy.

The pre-commit hook (`.githooks/pre-commit`) auto-encrypts when the plaintext
is newer than the `.enc` file.

## File-by-File Mapping

### Source-of-Truth in Dotfiles (`~/dotfiles/pi/agent/`)

| File | Runtime (`~/.pi/agent/`) | Drift? | Notes |
|---|---|---|---|
| `settings.json` | ✅ Exists | **YES — Significant** | Dotfiles has active defaults (opencode-go provider, deepseek-v4-flash model, high thinking level). Runtime has stale defaults (null provider, null model, low thinking level). Different package lists, enabled models, and additional config sections in runtime (pi-computer-use mode). |
| `models.json` | ✅ Exists (empty) | **YES — Critical** | Dotfiles has full provider definitions (nan builder, 5 models). Runtime has `{"providers":{}}` — empty. Pi must read models from dotfiles to function. |
| `auth.json` | ✅ Exists | **YES** | Different sizes (4195 vs 3238 bytes). Dotfiles has sops-decrypted API keys. Runtime has a separate copy — unclear how it was populated. |
| `trust.json` | ✅ Exists | **YES** | Dotfiles has macOS paths (/Users/juanbenjumea/) plus more Linux project-atom worktree paths. Runtime has different subset. |
| `extensions/` | ❌ Not present | N/A | Dotfiles houses all TypeScript extensions. Not synced to runtime. |
| `agents/` (reviewer.md, worker.md) | ❌ Not present | N/A | Agent definitions stored only in dotfiles. |
| `npm/` | ❌ Not present | N/A | npm packages + node_modules only in dotfiles. |
| `themes/` | ❌ Not present | N/A | Theme file only in dotfiles. |
| `sessions/` | ✅ Exists (different) | **YES** | Separate session directories — dotfiles tracks a different set of worktree session subdirs than runtime. |
| `git/` (cloned packages) | ✅ Exists | **YES** | Different git repo clones in each location. |
| `models-store.json` (262KB) | ❌ Not present | N/A | **Auto-generated** model cache (gitignored in `.gitignore`). Only in dotfiles. |
| `.gitignore` | ❌ Not present | N/A | Defines what's transient. |

### Runtime-Only (`~/.pi/agent/`, absent from dotfiles)

| File/Dir | Purpose |
|---|---|
| `pi-crash.log` (205KB) | Runtime crash log — auto-generated, transient |
| `run-history.jsonl` | Run history — auto-generated, transient |
| `observability/` | Observability state (history.jsonl, settings.json) |
| `context-prune/` | Context pruning settings (settings.json) |
| `intercom/` | Intercom broker socket + PID for cross-session messaging |
| `lesson-extractor/` | Lesson learning database (candidates.db, state.json) |
| `skills/` (symlinks) | Symlinks to `~/.agents/skills/*` — not tracked in dotfiles |
| `git/` | Git repos for packages installed via git: source — different package sets |

All runtime-only items are either auto-generated, transient state, or symlinks to
non-dotfiles locations.

## Deployment and Sync Mechanisms

### Dotter

Dotter **does not manage** pi/agent/ files. The `global.toml` has no entries
mapping pi/agent/ content anywhere. Dotter only handles:
- Core dotfiles (gitconfig, ssh, starship, etc.)
- Per-platform configs (Windows terminal, Neovim, etc.)
- Pre/post deploy hooks (secret decryption, skill syncing)

### No pi-deploy / pi-sync Tasks in justfile

The justfile has pi-related tasks, but **none for syncing or deploying config**:

| Task | What it does |
|---|---|
| `pi-stats` | Shows last N session costs from `~/.pi/agent/observability/history.jsonl` |
| `pi-session-size` | Shows disk usage of `~/dotfiles/pi/agent/sessions/` |
| `pi-prune-sessions` | Prunes old session files in `~/dotfiles/pi/agent/sessions/` |
| `patch-pi-npm` | Patches pi-fff adapter for symlinked npm root |
| `register-project` | Registers git project for home-server push deploy |
| `deploy-server` | Git-push branch to home server |
| `check-precommit` | Fast CI checks (includes dotter dry-run, shellcheck, deno lint for pi extensions) |

### No Symlinks Between Locations

Files in `~/dotfiles/pi/agent/` are **not symlinked** from `~/.pi/agent/`. Each is
an independent copy. The only symlinks found within either tree are:
- `~/.pi/agent/skills/*` → `~/.agents/skills/*` (runtime-side symlinks only)
- Internal npm `.bin` symlinks in node_modules

### Git-Push Deploy to Servers

Home servers (acerpepe, liedelpi) use a git-push deploy model:
- `just register-project <server>` — registers a repo on the server
- `just deploy-server <server> <branch>` — `git push <server> <branch>`

The `scripts/home-server-deploy/` directory contains server-side git hooks
(`post-receive`) that run after push. This deploys the **entire dotfiles repo**
to a server but does **not** have any pi-specific sync logic.

## Intended vs Actual Sync

### Intended Flow

1. User edits config in `~/dotfiles/pi/agent/` (the tracked git repo)
2. Environment variable `PI_CODING_AGENT_DIR` points pi directly at dotfiles
3. Pi reads settings/models/extensions/auth from dotfiles at runtime
4. Git clean filter strips machine-specific fields on commit
5. `secrets/pi-auth.json.enc` is decrypted by post_deploy hook
6. Git push to servers deploys the whole dotfiles repo
7. On the server, `PI_CODING_AGENT_DIR` would need to be set similarly

### Actual State / Drift Observed

1. **Runtime `~/.pi/agent/` is an incomplete snapshot**. Because `PI_CODING_AGENT_DIR`
   points to dotfiles, the runtime directory is mostly unused for config reading.
   However, some pi-internal code still reads global `~/.pi/agent/settings.json`
   as a **fallback base layer** — meaning the stale copy there can affect behavior
   (e.g., old `defaultThinkingLevel: "low"` could be merged).

2. **settings.json has drifted significantly**: dotfiles has active config
   (opencode-go default provider, deepseek-v4-flash model, high thinking level,
   17 enabled models, 18 packages including 3 git-packages), while runtime has
   old defaults (null provider/model, low thinking, 14 enabled models, 12 packages).

3. **models.json in runtime is effectively empty** (`{"providers":{}}` at 22 bytes).
   The dotfiles copy (1733 bytes) has full nan builder model definitions. Pi must
   be reading the dotfiles copy to function — meaning the runtime copy is dead weight.

4. **auth.json exists in both locations** with different sizes/content. This suggests
   the post_deploy decryption or some other process created a separate copy in ~/.pi/.

5. **trust.json has diverged** — dotfiles has macOS paths (from a Mac originating
   system) plus additional Linux paths, while the runtime copy is macOS-only.

6. **The runtime `~/.pi/agent/` directory appears to be a legacy artifact** from
   before `PI_CODING_AGENT_DIR` migration (commit `37cf45e` on 2026-07-13
   "track pi config via PI_CODING_AGENT_DIR"). After the migration, pi reads
   from dotfiles; the runtime directory was never cleaned up or synced.

### Risk Areas

| Risk | Severity | Details |
|---|---|---|
| Stale models.json in ~/.pi/ | Medium | If some code path reads models from runtime instead of dotfiles, models would be unavailable |
| Dual auth.json | High | API key confusion if code reads from wrong location |
| settings.json base-layering | Medium | The global → agent-dir merge means stale runtime settings can partially override or corrupt active dotfiles settings |
| No server-side PI_CODING_AGENT_DIR | Medium | Git-push deploy to servers doesn't set the env var — pi on servers would fall back to `~/.pi/agent/` with empty/stale config |

## Summary: Config Ownership Matrix

| Config File | Source of Truth | Sync State |
|---|---|---|
| `settings.json` | Dotfiles (`~/dotfiles/pi/agent/`) via PI_CODING_AGENT_DIR | Runtime `~/.pi/agent/settings.json` is stale fallback — should be removed or kept in sync |
| `models.json` | Dotfiles (`~/dotfiles/pi/agent/`) via PI_CODING_AGENT_DIR | Runtime copy is `{}` — dead weight |
| `auth.json` | Dotfiles (encrypted as `secrets/pi-auth.json.enc`, decrypted to `dotfiles/pi/agent/auth.json` by post_deploy) | Runtime copy is stale/different — risk |
| `trust.json` | Dotfiles (`~/dotfiles/pi/agent/`) | Runtime is a stale subset |
| `extensions/` | Dotfiles only | Not in runtime |
| `agents/` | Dotfiles only | Not in runtime |
| `npm/` (packages) | Dotfiles only | Not in runtime |
| `models-store.json` | Auto-generated from dotfiles | Only exists in dotfiles (gitignored) |
| Runtime state (`sessions/`, `pi-crash.log`, `run-history.jsonl`, `observability/`, `intercom/`, `context-prune/`, `lesson-extractor/`) | `~/.pi/agent/` only | Not in dotfiles — correct, these are transient |
| `skills/` | `~/.agents/skills/` (symlinked to dotfiles skills/ via bootstrap) | Runtime has symlinks — correct |

## Recommendations

1. **Clean up stale runtime config**: The `~/.pi/agent/settings.json`,
   `~/.pi/agent/models.json`, `~/.pi/agent/auth.json`, and `~/.pi/agent/trust.json`
   files appear to be legacy artifacts that should be removed to prevent confusion.
   They are not the source of truth.

2. **Audit auth.json duplication**: Check how `~/.pi/agent/auth.json` was created
   and ensure all API key reads go through the dotfiles copy via PI_CODING_AGENT_DIR.

3. **Verify pi-code doesn't read ~/.pi/agent/ models.json**: The pi-shared code
   shows settings.json uses layered resolution (global→agent→project), but models.json
   loading path should be verified to ensure it only reads from PI_CODING_AGENT_DIR.

4. **Document PI_CODING_AGENT_DIR requirement for server deployments**: Git-push
   deployed servers need the env var set in the pi-agent user's shell config.

## Commands and Evidence Collected

```bash
# Checked for deployment scripts
ls ~/dotfiles/scripts/ | grep -i pi  # No pi-specific scripts found
cat ~/dotfiles/scripts/strip-pi-machine-config.mjs  # Git clean filter script
ls ~/dotfiles/scripts/home-server-deploy/  # Git-push deploy hooks

# Checked justfile for pi-deploy/pi-sync tasks
grep -n 'pi-deploy\|pi-sync\|pi\.deploy' ~/dotfiles/justfile  # None found
grep -n 'pi' ~/dotfiles/justfile  # Only pi-stats, pi-session-size, pi-prune-sessions, patch-pi-npm

# Checked dotter templates
ls ~/.dotter/  # No pi template — dotter doesn't manage pi config
cat ~/dotfiles/.dotter/global.toml  # No pi/agent entries

# Checked symlinks
find ~/dotfiles/pi/agent/ -maxdepth 2 -type l -ls  # Only node_modules internal symlinks
find ~/.pi/agent/ -type l -ls  # skills/ symlinks only

# Compared directory structures
diff <(ls ~/dotfiles/pi/agent/) <(ls ~/.pi/agent/)
# Results: 6 files overlap (settings.json, models.json, auth.json, trust.json,
#           run-history.jsonl, sessions/, git/)
# Dotfiles-only: extensions/, agents/, npm/, themes/, models-store.json, .gitignore,
#                opencode-go-failover.log, APPEND_SYSTEM.md
# Runtime-only: pi-crash.log, context-prune/, intercom/, lesson-extractor/,
#               observability/, skills/

# Checked ENV setup
grep 'PI_CODING_AGENT_DIR' ~/dotfiles/config/fish/config.fish
# Result: set -x PI_CODING_AGENT_DIR $HOME/dotfiles/pi/agent

# Checked git clean filter
grep 'strip-pi-machine-config' ~/dotfiles/.gitattributes
grep -A2 'strip-pi-machine-config' ~/dotfiles/.git/config

# Checked secrets pipeline
ls ~/dotfiles/secrets/  # pi-auth.json.enc (8105 bytes)
grep 'pi-auth' ~/dotfiles/.dotter/post_deploy.bash  # Decrypts to dotfiles/pi/agent/auth.json

# Checked git history for migration
git show 37cf45e --stat  # "track pi config via PI_CODING_AGENT_DIR"
git show b093c36 --stat  # "migrate pi config to pi/agent/, clean up old pi_settings"
git show b562cf9 --stat  # "consolidate Pi resources under pi/agent"
```
