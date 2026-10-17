# Harness Recurrence — Findings

> Branch: `main`
> Date: 2026-10-17
> Investigator: pi (harness-mining tooling under `pi/agent/harness-mining/`)

## What this measures

The `pi-health-check` findings so far catalogued *which* data sources exist. This one aggregates them.

`pi/agent/harness-mining/` extracts one record per pi session — counts, hashes, durations, redacted signatures, cwd, cost — then ranks failures by how many *distinct* sessions they recur in. Records carry no prompt text or tool output; the only content on disk is `out/error-text.json`, the redacted first line of each failure reason.

Corpus at the time of writing:

| machine | sessions | tool calls | error rate | range |
| --- | --- | --- | --- | --- |
| framearch-juan | 3,008 | 483,840 | 5.6% | 2026-03-25 → 2026-10-17 |
| arch-wsl | 1,887 | 284,410 | 7.4% | 2026-04-27 → 2026-10-17 |
| mac-juan | 1,035 | 99,988 | 6.7% | 2026-03-28 → 2026-10-17 |
| **total** | **5,930** | **868,238** | **6.3%** | |

Other totals: 1,715,904 messages, 54,771 tool errors, 4,371 sessions (73.7%) with at least one failure, 2,084 compactions, $11,839 recorded cost, and 120.3B tokens of which **111.9B is cache reads** against 7.9B input and 0.3B output.

**The shape of the distribution is the main result.** Of 30,747 distinct failing signatures, only 1,019 recur in three or more sessions, and those cover 13,701 errors — **25% of all errors**. Three quarters of failures are one-off, task-specific, and not evidence of a harness defect.

## Class 1 — stale skill references (highest volume, clearest fix)

Skills referenced by instructions but absent from disk. These are pure configuration defects: every hit costs a failed tool call plus a recovery turn, and the same path fails for months.

| sessions | path referenced | status |
| --- | --- | --- |
| **119** | `~/.agents/skills/requesting-code-review/SKILL.md` | removed from catalog; symlinks and docs still point at it |
| 29 | `<project>/python/.pi/skills/data-catalog/SKILL.md` | never existed (17 absolute + 12 relative) |
| 8 | `<project>/python/.pi/skills/forecast-notes/SKILL.md` | never existed |
| 6 | `~/.pi/agent/skills/improve-codebase-architecture/ADR-FORMAT.md` | never existed |
| 6 | `~/.pi/agent/skills/improve-codebase-architecture/CONTEXT-FORMAT.md` | never existed |
| 6 | `<project>/python/.pi/skills/README.md` | never existed |
| 5 | `<project>/python/.pi/skills/indexation/SKILL.md` | never existed |
| 5 | `node .agents/skills/impeccable/scripts/context.mjs` | script gone; fails at module load |
| 4 | `~/.pi/agent/skills/verification-before-completion/SKILL.md` | removed from catalog |
| 4 | `~/.pi/agent/skills/requesting-code-review/SKILL.md` | blocked by `ctx_execute_file` path policy, not missing |
| 3 | `~/.pi/agent/skills/d1-context/SKILL.md` | never existed |

### The `requesting-code-review` case, traced

This one is 119 sessions across 9 projects, first 2026-08-10, **most recent 2026-10-17** — still live at 19 failures in October.

- The skill was **removed from the catalog** by `e86c51a chore: remove unused extensions and skills` and again by `842a363 Revert "merge: reconcile liedelpi configuration"` (2026-08-29).
- `~/.claude/skills/requesting-code-review` is a **dangling symlink** to `/home/juan/dotfiles/skills/requesting-code-review`. The same dangling entry exists on arch-wsl in both `~/.claude/skills/` and `~/.gemini/config/skills/`.
- `docs/patterns/end-of-shift.md:32` still instructs the agent to request review via that path.
- The content survives only in git: `git show 842a363^:skills/requesting-code-review/SKILL.md` (103 lines) plus `code-reviewer.md`.

Two other dangling symlinks come from the same pruning — `~/.claude/skills/systematic-debugging` and `~/.claude/skills/verification-before-completion` both point into `~/.agents/skills/`, which resolves to `~/dotfiles/skills` and no longer contains them.

**Resolved: references dropped, catalog unchanged.** The removal was judged intentional, so the stale references were deleted rather than the skills restored. `docs/patterns/end-of-shift.md` no longer names the skill, the five dangling symlinks in `~/.claude/skills/` were removed, and two further references to pruned skills were dropped from `AGENTS.md` (`grill-me`) and `docs/investigations/pi-health-check/README.md` (`systematic-debugging`). The content remains recoverable from git (`842a363^`, `9bc6956^`, `e6e4c62`) if that judgement is revisited.

The `<project>/python/.pi/skills/*` failures are separate and simpler: a project's `.pi/skills` references outlived the skill files.

## Class 2 — tool-schema validation failures

**2,986 sessions** have a tool-schema validation error as their most common failure reason. Recurring by signature:

| sessions | signature | failure |
| --- | --- | --- |
| 105 | `edit(edits)` | validation failed — no `path` emitted |
| 67 | `interview(questions)` | question-level vs. recommended shape |
| 59 | `ask_user_question(questions)` | validation failed |
| 42 | `todo(activeForm id status)` | validation failed |
| 18 | `bash()` | validation failed — empty arguments |

This is the largest class by session count and it is not about prompt wording. It is about tool descriptions and parameter schemas, which is why the `agent-experience` skill covers exactly this ground. Worth noting that `ask_user_question` and `todo` failures are concentrated on other machines, so the fix should be verified per machine rather than assumed portable.

## Class 3 — repository workflow facts

- `cd P && git add -A && git commit -m Q` — 78 sessions, 150 hits
- `cd P && git commit -m Q` — 78 sessions, 94 hits
- `git commit -m Q` — 47 sessions, 58 hits
- `git add -A && git commit -m Q` — 18 sessions, 29 hits

All four share the same reason: a local pre-commit hook that prints `🔍 Running local CI checks (saving GitHub Actions mi…`. Roughly 180 sessions hit this pattern.

Pushes fail separately: `git push origin main` in 49 sessions (`To github.com:huaxel/dotfiles.git`) and 44 sessions (`remote: error: GH013: Repository rule violations`). The hooks are intentional; the *recurrence* suggests the workflow instructions do not prepare the agent for them.

## Class 4 — delegation tools

| tool | calls | errors | rate |
| --- | --- | --- | --- |
| `agy_execute` | 722 | 310 | **42.9%** |
| `herdr_agent` | 1,869 | 295 | 15.8% |
| `ctx_execute` | 2,677 | 242 | 9.0% |

`agy_execute` fails two ways across 63 + 45 sessions: `agy timed out after 300000ms`, and `agy quota exhausted for claude-sonnet-4-6; choose another model`. Both are recoverable states handled by the caller, not harness defects — but a 43% failure rate on a delegation path is worth a routing default that checks quota before dispatching.

## Class 5 — inline Python execution

A consistent cluster of tracebacks from one-liners:

- `cd P && python3 -c Q` — 117 sessions, 192 hits
- `cd P && uv run python -c Q 2>&1` — 71 sessions, 237 hits
- `cd P && uv run python -c Q` — 57 sessions, 132 hits
- `python3 -c Q` — 49 sessions, 62 hits
- `cd P && python3 -c Q 2>&1` — 43 sessions, 63 hits
- `cd P && python -c Q` — 39 sessions, 56 hits

Hundreds of sessions reach for inline `python -c` and hit tracebacks. The signature collapses all tracebacks together, so the report cannot say *which* error without drilling into a specific session. Whether this is a bad habit worth discouraging or a signal that the Python environments differ per directory is not answerable from the aggregate.

## Other observations

- **`grep -n Q P` — 176 sessions, 485 hits**, reason `(no output)`. Grep exits 1 when nothing matches, which pi records as an error. This is the highest-recurrence signature in the corpus and it is **not a defect**: it is tool semantics being counted as failure. Any future "error rate" metric should treat exit-code results separately.
- **Error rate by thinking level**: `low` 9.2% (85 sessions) and `minimal` 9.5% (56) against `high` 5.7% (2,051) and `max` 4.7% (81). Suggestive, heavily confounded by task type, and the cleanest candidate for a paired test.
- **Model spread**: `nan/qwen3.6` 10.2%, `cline-pass/glm-5.2` 7.9% versus `fireworks/kimi-k2p5-turbo` 4.5%.
- **`ctx_execute_file` is blocked by path policy** when a referenced file resolves outside the project (4 sessions). Worth noting because it means the harness cannot read personal skills from a project session — the same class of limitation as loopback-only settings.

## Limits of this evidence

- **No counterfactual.** No session was ever run with and without a harness change, so every row here is a hypothesis about where to look. Only a paired arm produces evidence — upstream `packages/evals` implements two-arm runs and lift.
- **Harness attribution is partial.** Prompt-section fingerprints exist only from 2026-09-20 (326 of 3,008 sessions locally, 204 distinct fingerprints). Configuration-versus-outcome correlation is not available yet; it accrues on every new session from now on, which is the reason to keep the record store rather than treat this as a one-off analysis.
- **Error is not harm.** See the `grep` row above. Some high-recurrence signatures are correct behavior.
- **`bash` signatures are shape-normalized** (`cd P && …`), so a signature collapses across repositories; the `top cwd` column shows where it concentrates.
- **Subagent transcripts are excluded** (`subagents-herdr/` is not under `sessions/`).

## Reproducing

```sh
cd pi/agent/harness-mining
node extract.mjs            # ~12s for 3,008 sessions, incremental afterwards
node report.mjs --top 30    # writes out/report.md
```

Other machines, writing nothing to their disks — the extractor streams records back over stdin:

```sh
node bundle.mjs > /tmp/harness-mining.mjs
ssh arch-wsl "node --input-type=module - --stdout --machine arch-wsl \
  --sessions ~/dotfiles/pi/agent/sessions --sessions ~/.pi/agent/sessions" \
  < /tmp/harness-mining.mjs | node ingest.mjs
```

**Falsification test.** After fixing a signature, re-run and check it moves out of the recurring table. For the missing-skill class that is a clean pass/fail: `requesting-code-review` should disappear entirely once the reference and the catalog agree.

## Concrete changes this supports

1. ~~Reconcile the skill trees.~~ Done: references dropped, five dangling symlinks removed, catalog left as pruned. `verification-before-completion` and `systematic-debugging` now have no referent anywhere, which is the intended end state.
2. Audit `.pi/skills` references in `project-atom/python` against the files that exist.
3. Review tool parameter schemas for `edit`, `ask_user_question`, `todo`, and `interview` — the largest single failure class at 2,986 sessions.
4. Add quota pre-checks to the `agy_execute` routing path, and teach the workflow docs about the pre-commit and push-hook rejections.
