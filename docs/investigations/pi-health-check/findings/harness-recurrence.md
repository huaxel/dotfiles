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
| framearch-juan | 3,123 | 488,884 | 5.6% | 2026-03-25 → 2026-10-17 |
| arch-wsl | 1,442 | 236,855 | 7.4% | 2026-04-27 → 2026-10-17 |
| mac-juan | 1,035 | 100,023 | 6.7% | 2026-03-28 → 2026-10-17 |
| **total** | **5,600** | **825,762** | **6.3%** | |

**Deduplication, and why the first draft of this document was wrong.** The three machines hold **10,825 session files for 5,600 distinct sessions**: the runtime session directory keeps several files per conversation, and the dotfiles copy shares sessions with it, so 5,225 files are duplicates collapsed here by session-header id. Counting files instead of sessions overstated the earlier draft by roughly 330 sessions. The two stores are not consistently nested either — on framearch-juan the runtime store is a strict superset (113 sessions exist only there, all previously unmined), while on arch-wsl the runtime store is entirely duplicate. Every machine is therefore scanned at both roots and deduplicated.

Other totals: 1,634,440 messages, 51,737 tool errors, 4,080 sessions (72.9%) with at least one failure, 1,955 compactions, $10,716 recorded cost, and 115.7B tokens dominated by cache reads.

**A correction to this section's first draft.** An earlier version reported that roughly three quarters of failures were one-off. That figure was an artifact of the signature normalizer: it collapsed absolute paths and quoted strings but left relative paths and bare filenames intact, so `ruff check cli/a.py` and `ruff check cli/b.py` counted as separate one-off signatures. Re-grouping exposed patterns spanning hundreds of sessions — `grep -n Q P` alone merged from 171 sessions and 476 hits to **283 sessions and 1,191 hits**. The corrected normalization changes the measurements below.

**The shape of the distribution.** Of 25,270 distinct failing signatures, 1,322 recur in three or more sessions and cover **36.3% of all errors**. The one-off share is **63.7%**, not three quarters.

**Treat the ratio as grain-dependent, and the ranking as robust.** A residual test that merges one-off signatures on 0.6 token similarity still finds 8,308 that span three or more sessions, which would put the one-off share near 40%. The true value sits between roughly 40% and 64% depending on where the boundary is drawn, so nothing here should rest on the exact ratio. What is stable is the top of the table: the largest patterns are large under every variant of the rule.

### Robustness of that claim

Two checks, because the whole conclusion rests on it.

**The per-project breakdown holds.** Across the eight projects with enough errors to be reliable, the one-off share runs 45–78% — nursultan-web 64%, project-atom 55%, `python` 59%, belpolsim 75%, dotfiles 75%, `juan` 78%, garamatic 71% — and 61.9% combined. The aggregate is not an artifact of one dominant project.

**One exception, and it is informative.** cloud-integration is 45% one-off, the lowest of the large projects and well below the 62% combined figure, so it carries the highest proportion of systematically recurring failures. It is also the project where the `ctx_execute` signature lived (24 of its sessions), which fits: a systematic tool defect shows up as recurring failures rather than one-offs. Projects with fewer than 200 failing hits are excluded as unreliable.

**The deduplication rule is safe, verified corpus-wide.** 3,456 of 5,600 session ids exist as more than one file, and **none** of those copies disagree on tool calls — the most-complete and least-complete rules produce identical totals, 825,847 calls either way. Every duplicate is a true copy, which is what justifies collapsing them by id.

## Machine inventory

Every machine reachable over SSH and every pi session store on it:

| machine | pi sessions | other harness stores |
| --- | --- | --- |
| framearch-juan (local) | 3,123 | `.gemini` 3,522 · `.factory/sessions` 220 · `.claude/projects` 2 · `.codex/sessions` 1 |
| arch-wsl | 1,442 | `.gemini` 2,251 · `.claude/projects` 100 · `.codex/sessions` 10 |
| mac-juan | 1,035 | `.gemini` 504 · `.codex/sessions` 286 · `.claude/projects` 22 |
| liedelpi | 5 | — |
| acerpepe | 3 | — |
| bf-lt020980 | unreachable (tailscale timeout) | — |
| campagne-rbnb | unreachable (port 2222 timeout) | — |

`liedelpi` and `acerpepe` run **nushell** as the login shell, so a POSIX command sent over SSH fails with a parser error and returns nothing — which is how a first sweep of those hosts silently reported "no sessions" rather than an error. Any remote sweep must invoke `bash -lc` explicitly. Between them they hold eight sessions and are not worth mining.

The `.gemini`, `.claude`, `.codex`, `.factory`, and `.commandcode` directories belong to other harnesses and are out of scope: their formats differ, and this analysis is about pi's session log.

## Reliability is not improving on its own

Error rate by month across all three machines, which is flat rather than trending down:

| month | sessions | calls | errors | rate |
| --- | --- | --- | --- | --- |
| 2026-04 | 501 | 81,621 | 3,808 | 4.7% |
| 2026-05 | 685 | 79,625 | 3,944 | 5.0% |
| 2026-06 | 1,309 | 124,664 | 8,027 | 6.4% |
| 2026-07 | 1,481 | 185,709 | 15,082 | **8.1%** |
| 2026-08 | 1,021 | 151,290 | 9,085 | 6.0% |
| 2026-09 | 580 | 155,174 | 9,913 | 6.4% |
| 2026-10 | 337 | 89,401 | 4,834 | 5.4% |

The recurring defects in this document have been failing for months without decay, which is consistent with them being unobserved rather than self-correcting. 2026-10 is partial.

## Class 1 — stale skill references

Skills referenced by instructions but absent from disk. These are pure configuration defects: every hit costs a failed tool call plus a recovery turn, and the same path fails for months.

| sessions | path referenced | status |
| --- | --- | --- |
| **119** | `~/.agents/skills/requesting-code-review/SKILL.md` | removed from catalog; symlinks and docs still point at it |
| 29 | `<project>/python/.pi/skills/data-catalog/SKILL.md` | **path bug, not a missing skill** — see below |
| 8 | `<project>/python/.pi/skills/forecast-notes/SKILL.md` | same path bug |
| 6 | `~/.pi/agent/skills/improve-codebase-architecture/ADR-FORMAT.md` | skill existed until 842a363; these two files never did |
| 6 | `~/.pi/agent/skills/improve-codebase-architecture/CONTEXT-FORMAT.md` | same |
| 6 | `<project>/python/.pi/skills/README.md` | same path bug as `data-catalog` |
| 5 | `<project>/python/.pi/skills/indexation/SKILL.md` | same path bug |
| 5 | `node .agents/skills/impeccable/scripts/context.mjs` | script gone; fails at module load |
| 4 | `~/.pi/agent/skills/verification-before-completion/SKILL.md` | removed from catalog |
| 4 | `~/.pi/agent/skills/requesting-code-review/SKILL.md` | blocked by `ctx_execute_file` path policy, not missing |
| 3 | `~/.pi/agent/skills/d1-context/SKILL.md` | removed from catalog; referenced by nursultan-web's `.agents/skills-lock.json` with `auto_invoke: true` |

### The `requesting-code-review` case, traced

This one is 119 sessions across 9 projects, first 2026-08-10, **most recent 2026-10-17** — still live at 19 failures in October.

- The skill was **removed from the catalog** by `e86c51a chore: remove unused extensions and skills` and again by `842a363 Revert "merge: reconcile liedelpi configuration"` (2026-08-29).
- `~/.claude/skills/requesting-code-review` is a **dangling symlink** to `/home/juan/dotfiles/skills/requesting-code-review`. The same dangling entry exists on arch-wsl in both `~/.claude/skills/` and `~/.gemini/config/skills/`.
- `docs/patterns/end-of-shift.md:32` still instructs the agent to request review via that path.
- The content survives only in git: `git show 842a363^:skills/requesting-code-review/SKILL.md` (103 lines) plus `code-reviewer.md`.

Two other dangling symlinks come from the same pruning — `~/.claude/skills/systematic-debugging` and `~/.claude/skills/verification-before-completion` both point into `~/.agents/skills/`, which resolves to `~/dotfiles/skills` and no longer contains them.

**Resolved: references dropped, catalog unchanged.** The removal was judged intentional, so the stale references were deleted rather than the skills restored. `docs/patterns/end-of-shift.md` no longer names the skill, the five dangling symlinks in `~/.claude/skills/` were removed, and two further references to pruned skills were dropped from `AGENTS.md` (`grill-me`) and `docs/investigations/pi-health-check/README.md` (`systematic-debugging`). The content remains recoverable from git (`842a363^`, `9bc6956^`, `e6e4c62`) if that judgement is revisited.

The `<project>/python/.pi/skills/*` rows are **not missing skills**. Verified on arch-wsl: `~/project-atom/.pi/skills/` contains `data-catalog`, `forecast-notes`, `indexation`, `verification`, and eight more. `~/project-atom/python/.pi/` exists but has no `skills/` directory.

The cause is a relative-path collision. `~/project-atom/AGENTS.md` routes to skills with repository-root-relative links — `[data-catalog](.pi/skills/data-catalog/SKILL.md)` — and when the working directory is `python/` or a herdr worktree, that path resolves against the working directory into a location that does not exist. The distribution bears this out: 121 sessions, 107 of them on arch-wsl, across roughly twenty distinct working directories, every one of them a subdirectory or worktree of the same repository.

Pi's system prompt already warns about this hazard for paths *inside* a skill (“resolve it against the skill directory”), and it advertises each skill's absolute `<location>`. A routing table does not need paths at all, since naming the skill is enough. **Open:** the fix belongs in `project-atom`'s `AGENTS.md`, a separate repository.

## Class 2 — tool-schema validation failures (largest identified single cause)

Validation failures account for **3,947 error hits — 7.6% of every error in the corpus — across 2,986 sessions**. The tool declares a parameter and the model does not emit it:

| hits | tool | complaint |
| --- | --- | --- |
| 731 | `bash` | `reasoning: must have required properties reasoning` |
| 677 | `read` | `reasoning` |
| 271 | `grep` | `reasoning` |
| 262 | `bash` | `command: must have required properties command` |
| 206 | `edit` | `edits.0.newText: must have required properties newText` |
| 193 | `write` | `reasoning` |
| 166 | `edit` | `edits: must have required properties edits` |
| 134 | `todo` | `action: must have required properties action` |
| 129 | `edit` | `reasoning` |
| 121 | `find` | `reasoning` |
| 95 | `bash` | `reasoning, command` |
| 93 | `edit` | `reasoning, path` |

**Missing `reasoning` alone is 2,373 hits across 583 sessions — 60% of all validation failures and the single largest identified cause of failure anywhere in the corpus.** It is not one provider's quirk:

| model | hits |
| --- | --- |
| `openai-codex/gpt-5.6-luna` | 1,170 |
| `opencode-go/deepseek-v4-flash` | 901 |
| `openference/GLM-5.2` | 341 |
| `commandcode/deepseek/deepseek-v4-flash` | 326 |
| `openference/DeepSeek-V4-Flash-0731` | 321 |
| `openference/GLM-5.3` | 317 |
| `umans/umans-deepseek-v4-flash-0731` | 311 |
| `umans/umans-glm-5.2` | 273 |

Seven different providers, four model families. The schema requests a free-text rationale on every tool call, which no public tool-calling format asks for, and models trained on those formats do not produce it by default. Each omission costs a failed call plus the turn spent recovering.

This is a harness design question, not a prompt question: either `reasoning` stops being required, or it becomes something the model is reliably reminded to emit. The evidence points at the schema — a required field that most models omit most of the time is not a discipline problem to correct with instructions.

### Where the required field comes from, and why it is a wiring defect

`reasoning` is not a pi built-in. It is injected by **`@mobrienv/pi-tidy-tools`** (installed 0.5.4, the latest published), which adds a goal field to every wrapped tool so the transcript can render a reasoning headline.

The extension already contains the tolerant path:

```ts
// tool-composition.ts
export function fillMissingReasoning(args: any): any {
	if (!args || typeof args !== "object" || Array.isArray(args) || Object.hasOwn(args, "reasoning")) return args;
	return { ...args, reasoning: "" };
}
```

Its docstring states the intent: *"Satisfy the required `reasoning` with an empty headline when the caller omitted it. An empty headline renders the argument-detail fallback."* The renderer falls back to argument detail on its own, so nothing is lost when the field is absent.

But the hook is wired to a single condition — `index.ts:451`:

```ts
tolerateMissingReasoning: codemodeActive,
```

The fallback therefore runs **only in sessions where codemode is active**. Everywhere else the field stays strictly required and the call fails validation. Measured against the sessions whose prompt persisted a tool set:

| sessions | reasoning-missing failures |
| --- | --- |
| codemode declared (222) | **0 (0.0%)** |
| codemode not declared (426) | **52 (12.2%)** |

Not one failure in 222 codemode sessions; 12.2% of non-codemode sessions lose at least one call to it. That asymmetry is the defect, and it is a wiring error rather than a policy: the extension already believes an empty headline is acceptable.

### Recommended fix

Make tolerance unconditional — `tolerateMissingReasoning: () => true` at `index.ts:451`. That removes all 2,373 hits and keeps the reasoning headline for the models that do supply it, which is strictly better than the alternatives:

- `"mode": "result"` removes the parameter everywhere, losing the headline even for compliant models.
- `"enabled": false` disables all seven tool overrides, losing the rendering entirely.
- Doing nothing keeps ~4.6% of every error in the corpus.

**The causal chain is verified in source, not inferred from correlation.** Each link was read directly:

1. Tidy makes the field mandatory — `withReasoning()` builds `required = ["reasoning", ...schema.required]` in `tool-composition.ts`.
2. Pi prepares arguments **before** validating them — `packages/agent/src/agent-loop.ts` calls `prepareToolCallArguments(tool, toolCall)` and then `validateToolArguments(tool, preparedToolCall)` on the next line.
3. Tidy's tolerant path is gated on one condition — `tolerateMissingReasoning: codemodeActive` in `index.ts:451`, with `fillMissingReasoning()` supplying an empty headline when the caller omitted the field.
4. The failure text in the corpus is produced by that validation step — `Validation failed for tool "${toolCall.name}":` thrown from `packages/ai/src/utils/validation.ts:350`, whose format matches the recorded reasons exactly.
5. And it measures out — 0 of 222 codemode sessions show the failure, 52 of 426 without codemode do.

Because step 2 is that ordering, a `prepareArguments` that fills the field does satisfy the validator. The same pattern exists in `packages/durable/src/harness/tool.ts`, so the fix holds for both harnesses.

Upstream 0.5.4 is the newest release and still gates on `codemodeActive`, so this needs a local patch. The existing file is `pi/agent/npm/patches/@mobrienv+pi-tidy-tools+0.5.3.patch` — **named for 0.5.3 while 0.5.4 is installed**, and its `>=0.80.6 → *` peer change is absent from the installed package, so that patch no longer applies. Retargeting it at 0.5.4 is the natural home for the one-line change. **Open:** this alters agent behaviour and is a decision for the owner.

The other required-parameter gaps may be *caused* by this one: `bash` with `reasoning` but no `command` (262), `edit` with neither `edits` nor `path` (254), and `todo` without `action` (134) read as calls where the extra mandatory field crowded out the real argument.

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

Hundreds of sessions reach for inline `python -c` and hit tracebacks. With the improved reason capture, the causes separate cleanly:

| hits | exception |
| --- | --- |
| **408** | `ModuleNotFoundError` |
| 93 | `SyntaxError` |
| 77 | `AttributeError` |
| 73 | `FileNotFoundError` |
| 61 | `TypeError` |
| 60 | `NameError` |
| 52 | `ImportError` |
| 51 | `KeyError` |

`ModuleNotFoundError` dominates: the one-liner imports a package the selected interpreter lacks, including under `uv run`. A separate cluster is timeouts — 46 hits at the 30 s default and 50 at 120 s — which is a call-site problem, not an environment one.

`SyntaxError` (93) is a shell-quoting artifact: writing Python inside `python3 -c "…"` with nested quotes breaks the quoting. A heredoc or a temporary file avoids it entirely.

## Other observations

- **Most of the recurring table is historical.** Of 1,322 signatures recurring in three or more sessions, only **517 occurred in the final 30 days** of the corpus. Ranking by all-time volume mixes live defects with patterns that stopped months ago — `ctx_execute` at rank four (101 sessions, 185 hits) last failed on 2026-07-13, and `interview` (64 sessions) on 2026-07-12. The report now carries a `last seen` column and a *Still occurring* table so the actionable subset is separate from the graveyard. This also means any automated learner would spend most of its budget re-deriving patterns that no longer fire.
- **`grep -n Q P` — 283 sessions, 1,191 hits**, reason `(no output) · Command exited with code 1`. Grep exits 1 when nothing matches, which pi records as an error. This is the highest-recurrence signature in the corpus and it is **not a defect**: it is tool semantics being counted as failure. Any future "error rate" metric should treat exit-code results separately. It was previously undercounted as 171 sessions because per-file variants did not collapse.
- **Error rate by thinking level**: `low` 9.2% (85 sessions) and `minimal` 9.5% (56) against `high` 5.7% (2,051) and `max` 4.7% (81). Suggestive, heavily confounded by task type, and the cleanest candidate for a paired test.
- **Model spread**: `nan/qwen3.6` 10.2%, `cline-pass/glm-5.2` 7.9% versus `fireworks/kimi-k2p5-turbo` 4.5%.
- **`ctx_execute_file` is blocked by path policy** when a referenced file resolves outside the project (4 sessions). Worth noting because it means the harness cannot read personal skills from a project session — the same class of limitation as loopback-only settings.

## Limits of this evidence

- **No counterfactual.** No session was ever run with and without a harness change, so every row here is a hypothesis about where to look. Only a paired arm produces evidence — upstream `packages/evals` implements two-arm runs and lift.
- **These figures are a snapshot, not a constant.** Sessions are appended while an analysis runs, so counts drift between extractions — a refresh during this investigation moved tool calls from 825,552 to 825,762 without anything changing except elapsed time. Re-extract before quoting any number; the incremental skip makes it seconds.
- **A signature is not always one defect, and the report now says which is which.** Signatures built from a bare tool call name the tool plus its argument shape, so they aggregate every distinct failure: `ctx_execute(code language)` spans 160 reasons at a 6% top share, and `edit(edits)` 133 at 10%. Shell signatures can aggregate too — `cd P && uv run ruff check P P P …` spans 161 at 1% — while others are exact, `grep -n Q P` at 98% and the removed-skill read at 100%. Nine of the twelve largest rows have a top share under half. Read an aggregating row as *how often this operation fails*, not as one defect, and use the `distinct`/`top` columns rather than the tool name to tell them apart.
- **The extractor has been independently checked.** A recursive recount of 60 sessions in Python — a different language, a different parsing path, comparing against *every* record sharing a session id — reproduced tool calls, tool errors, compactions, messages, and failing-hit totals exactly, with zero mismatches. The first run of that check reported five mismatches, all of which were stale snapshots of sessions appended after extraction, plus one definitional difference over message entries that carry no `message` object. Both were resolved by refreshing and correcting the check, and neither was an extractor defect.
- **Wall-time figures are also a snapshot with partial coverage.** Durations are recorded per tool result only by recent pi versions, so the 501-hour machine total is a lower bound and the per-tool shares come from the sessions that record them.
- **Harness attribution is partial.** Prompt-section fingerprints exist only from 2026-09-20 (649 of 5,600 sessions, 403 distinct fingerprints). Configuration-versus-outcome correlation is not available yet; it accrues on every new session from now on, which is the reason to keep the record store rather than treat this as a one-off analysis.
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

## What the harness surface costs per prompt

Every finding above is error-centric, which is a proxy. The question behind this investigation — whether to add something to pi — needs the price of the surface already there, because the session log persists every tool declaration with its full description in the first system message. That makes the fixed per-prompt overhead directly measurable.

**Measured from 328 sessions with a persisted tool declaration:**

| metric | value |
| --- | --- |
| median declared schema | 39,582 chars ≈ **9,894 tokens per prompt** |
| median tools declared | 29 |
| median cost per tool | 1,296 chars ≈ **341 tokens** |

The measurement is now produced by the report itself from the records, so `mine.sh` regenerates it rather than relying on a one-off scan. Across the 500 sessions that persist a declaration:

| metric | value |
| --- | --- |
| median declared schema | **9,894 tokens per prompt** |
| median tools declared | 29 |
| median cost per tool | **341 tokens** |
| median first request | 17,068 tokens |
| schema share of the first request | **58%** |
| weighted over those sessions' own tokens | 1.19B of 23.1B = **5.1%** |
| against the whole corpus | 1.19B of 115.9B = 1.0% (lower bound) |

The most recent 200 sessions carry 49 distinct declarations totalling ≈14,700 tokens per prompt, so the surface has grown rather than shrunk. The like-for-like figure is the 5.1%: only 500 sessions persisted a schema while every session contributes tokens, so dividing by the whole corpus understates it. **An earlier draft of this section claimed 6–10% of all tokens, computed as a median schema size multiplied by every request in the corpus; the per-session-weighted figure supersedes it.**

### Where the budget goes

| declaration | tokens |
| --- | --- |
| `web_search` | 1,131 |
| `mcp` | 835 |
| `agy_execute` | 742 |
| `fetch_content` | 719 |
| `herdr_agent` | 665 |
| `source_check` | 589 |
| `capacity` | 528 |
| `vcc_recall` | 469 |
| `herdr_pane` | 462 |
| `grep` | 444 |

Nine extension tools consume about 6,100 of the 14,700 tokens in a scan of the most recent 200 sessions. MCP tools are not the problem — only seven declarations, 896 tokens in total. The per-tool split comes from that scan; the report computes the totals, so treat the individual figures as indicative until the report carries the breakdown too.

This reorders the priorities. The largest identified *defect* — the `reasoning` gate — costs 2,373 failed calls out of 825,952, **0.3% of calls**. The prompt surface costs **5.1% of tokens** across the sessions that can be measured, roughly seventeen times more.

Two consequences for the original question. First, **adding anything to pi has a standing cost**: a new tool costs its declaration length × every request from then on, and the most expensive existing tools charge 500–1,100 tokens each. Second, **trimming descriptions is a larger lever than fixing failures**, and it needs no new machinery — the three heaviest entries after `web_search` and `mcp` are this setup's own `agy_execute`, `fetch_content`, and `herdr_agent`.

One caveat on interpretation: schema tokens sit in the cached prompt prefix, so they are cheap per token and their marginal latency cost is lower than the raw number suggests. The comparison to defect cost holds because both are measured in the same units.

### Is the full schema actually sent?

The measurement above counts the `toolsAdded` registration payload. pi also persists a rendered `sections.tools` list in the same system message — and that one is only **1,547 chars against 40,913** for the registration payload, a ratio of 0.04. If the rendered list were what the model receives, every surface figure here would be about twenty-five times too high.

The provider adapter is the primary evidence. In the installed pi-ai 1.3.0 Anthropic adapter, `buildParams()` takes the initial system message's `toolsAdded` and assigns `convertToolDefinitions(initialTools, ...)` to `params.tools` (or derives the current tool list and assigns its converted definitions there); the later request sends those parameters to the provider. With native tool changes enabled, later declarations are sent in `tool_addition` blocks instead. Thus, for this Anthropic path, the rendered `sections.tools` summary is not a substitute for the definitions sent to the provider. Other provider adapters may serialize tool changes differently, so this source check does not establish every provider path.

The usage comparisons are a consistency check, not proof of serialization: across 489 sessions, the first-request-token regression slope is **1.54** per schema token; sessions declaring ≥30 tools bill a median **17,008** first-request tokens versus **5,847** for sessions declaring ≤10. These associations can be confounded by prompt and provider differences. They are consistent with the source evidence and the 58% ratio of medians, but should not be described as proving causality. The surface figures stand for the measured registration payload; the claim about what the provider receives is scoped to the verified adapter path.

### Independent check

The estimate above is derived from declaration text, so it was cross-checked against a different field — the usage the provider reported for the session's first request, which includes the cached prefix. Across 120 sessions carrying both measurements:

| measurement | median |
| --- | --- |
| declared-schema estimate | 9,520 tokens |
| billed first request (input + cacheRead) | 15,410 tokens |

**The tool declarations are 56% of the first-request prompt.** Two methods derived from independent data agree in magnitude, and the estimate never exceeds what was billed, which is the direction the claim requires.

The remainder — roughly 5,900 tokens — is everything else: prompt sections, project context, skills, and the first user message. So the declared tool surface is a larger share of the context than the instructions are, and it has more headroom to trim.

### Is the verbosity load-bearing?

Trimming descriptions is only safe if they are not earning their tokens. Tool descriptions exist partly to prevent argument misuse, so the test is whether verbose declarations have fewer argument errors — the validation failures that are *not* about the injected `reasoning` field.

A raw comparison says the opposite (+0.50 rank correlation, longer descriptions going with more errors), but that is an exposure artifact: `bash` has 429,855 calls at 0.05 errors per 1,000, while `codemode` has 667 calls at 22.5. Controlling for the obvious confounder gives:

| predictor | Spearman vs argument-error rate |
| --- | --- |
| description size (chars) | **+0.13** |
| parameter count | **−0.37** |

Neither explains the error rate, and the parameter-count direction is the wrong sign for the obvious story. What the ranking actually tracks is **argument shape**:

| argument shape | examples | errors per 1,000 calls |
| --- | --- | --- |
| free-form or nested | `codemode` 22.5 · `ask_user` 10.3 · `todo` 6.2 · `edit` 4.8 | 5–22 |
| flat and simple | `bash` 0.05 · `read` 0.14 · `find` 0.38 · `grep` 0.34 | 0.05–0.4 |

The ten heaviest declarations account for 36,504 chars — 9,126 tokens, most of the per-prompt surface — across **163,043 calls with 690 argument errors**, or 4.2 per 1,000. Trimming is therefore not visibly a trade of tokens for mistakes. Note also that `codemode`'s rate is the same tidy `reasoning` directive as Class 2, not a schema problem.

Caveat: 25 tools is a small sample, call volume is heavily skewed, and these are cross-sectional associations between heterogeneous tools. The result is enough to say the declaration text is not carrying the argument-error load, not enough to promise that any specific cut is free.

## Where wall time goes

Errors and tokens are two axes; the third is time, which is what a session actually feels like. Durations are recorded per tool result, so they can be summed corpus-wide.

| tool | hours | share | calls ≥60s |
| --- | --- | --- | --- |
| `ask_user` (human wait) | 224 | 45% of raw total | 583 |
| `bash` | 220 | 44% of machine total | 2,717 |
| `agy_execute` | 52 | 10% of machine total | 86 |
| `codemode` | 3 | 0.5% | 38 |
| everything else | <2 | <1% | <10 |

Machine time totals **501 hours**; human waiting adds **224 hours** on top. Across 5,600 sessions over seven months that is roughly 30 days of continuous time, of which about nine days was a person reading and answering prompts.

Three things follow.

**The harness's own overhead is not a latency problem.** Tool dispatch, file reads, edits, greps, and memory lookups total under two hours between them. Time goes to `bash` doing real work — CI runs, test suites, builds — and to waiting for a human.

**`agy_execute` is the one genuine latency outlier, and its latency coincides with its failures.** 52 hours for 722 calls is about four minutes per call on average, with 86 calls past a minute, and it is simultaneously the worst error rate in the corpus at 42.9% (300 s timeouts and quota exhaustion). That combination — slow *and* failing — is what makes the quota pre-check the highest-value workflow fix.

**Human attention is the scarce resource, not machine time.** The 583 long `ask_user` waits cost more wall-clock time than every `bash` call combined. Any addition to the harness that introduces a confirmation, a clarification round-trip, or an approval step multiplies that number, which sharpens the case against adding surface.

One caveat: only recent pi versions record per-result durations — 27% of tool results in a recent-file sample — so 501 hours is a lower bound, and the share by tool is inferred from the sessions that do record it.

## Defect churn and lifetime

A flat error rate could mean either that defects accumulate unobserved or that they arrive and retire at the same rate. Birth and death dates per signature distinguish the two. For the 1,322 signatures that recur in three or more sessions:

| month | new | retired | net |
| --- | --- | --- | --- |
| 2026-04 | 257 | 27 | +230 |
| 2026-05 | 141 | 58 | +83 |
| 2026-06 | 218 | 90 | +128 |
| 2026-07 | 370 | 323 | +47 |
| 2026-08 | 211 | 191 | **+20** |
| 2026-09 | 96 | 115 | −19 *(censored)* |
| 2026-10 | 23 | 0 | +23 *(censored)* |

Retirements cannot be observed within 30 days of the corpus end, so only April–August is interpretable. Over that window net accumulation falls from **+230 to +20**, with arrivals and retirements roughly matching by August. The recurring-defect population is saturating rather than growing, which is what a flat error rate looks like when it is a steady state rather than a blind spot. (These counts rose with the normalization fix, which merged variants; the shape is unchanged.)

**Median lifetime of a recurring defect is 35 days** — quartiles 10 and 56. Of the 1,322, **805 had stopped by the cutoff and 517 were still recurring**.

The lifetime is the finding that matters for the original question. A convergence-style improvement loop needs repeated occurrences and a probe budget before it can conclude anything; prime-agent's `/refine` needs several refinement events before a lesson is even a candidate. On a population with a 29-day median lifetime and a 10-day lower quartile, much of what such a loop learns is about to stop anyway. Two of the largest stopped signatures illustrate the trap in the other direction: `ctx_execute` (101 sessions) and `interview` (64) did not get fixed, they disappeared because the tools were removed — 46 of the 113 large signatures ended when their capability did. A learner cannot tell those apart from repairs; counting plus a git log can.

### The lever is detection latency, not learning

If recurring defects live about a month, then what matters is how quickly a new one is noticed. Manual inspection has no cadence at all, which is why a 119-session failure could run from August to October. A monthly re-run would detect a new signature within 30 days — roughly the population's entire median lifetime, catching it at the moment it retires. **A weekly re-run costs nothing extra** (extraction is incremental and takes seconds) and detects within about a quarter of that lifetime, while the defect is still worth fixing.

That is the concrete recommendation this analysis supports: keep the 55-second extractor, run `report.mjs` weekly, work the *Still occurring* table from the top. No learner, no scheduler complexity, and no new surface — which matters because the surface itself is the most expensive thing measured here.

## Should the harness improve itself from this evidence?

The question that motivated this investigation was whether to build something on pi that mines sessions, traces, and memory to improve the harness. The corpus answers it, and largely in the negative.

**Most failures still do not recur, though far fewer than first measured.** 63.7% of errors sit in signatures seen in fewer than three distinct sessions, and the true figure is somewhere between 40% and 64%. The direction still matters: a large share of failures is task-specific rather than a harness defect, which is why the report ranks by recurrence instead of listing everything.

**Every recurring defect found was mechanical, and none needed a reflective loop.** The 119-session skill failure was fixed by editing one document and deleting five symlinks. The 2,373-hit reasoning failure is a one-line wiring change in an extension. Every trace-up ended in a missing file, a relative path, an exit-code convention, or a single boolean. Deterministic counting found all of them; a loop that proposes prose edits to prompts and skills would have found none of them, because none of them are prose problems.

**The configuration signal is not available yet.** Prompt-section fingerprints exist only from 2026-09-20 — 649 of 5,600 sessions, 403 distinct fingerprints. Nothing can correlate configuration with outcome at that density.

**And the defects persisted for months despite being cheap to fix.** Error rate has hovered between 4.7% and 8.1% with no downward trend since April. The reason was not insufficient machinery; it was that nobody looked. One day of deterministic analysis found all of it.

**Most of the recurring list is already dead.** Only 517 of 1,322 recurring signatures occurred in the final 30 days. The rest stopped months ago and were never noticed either — `ctx_execute` at rank four by all-time volume last failed on 2026-07-13. A learner trained on this corpus would rediscover the graveyard before it reached anything live.

### The memory tier is not yet an improvement mechanism

The original question named memory alongside traces and logs, and it is the one source not covered by the failure analysis. Measured across `~/.pi/agent/memory/` (3.2 MB total):

| tier | files | tagged entries | auto summaries | size |
| --- | --- | --- | --- | --- |
| global `MEMORY.md` | 1 | 3 | 0 | 1 KB |
| project `MEMORY.md` | 10 | 13 | 0 | 112 KB |
| `SCRATCHPAD.md` | 9 | 0 | 0 | 28 KB |
| daily logs | 94 | **326** | 42 | 2,718 KB |

**Collection works; promotion does not.** The durable tier holds 16 curated entries against 326 in the daily tier — about **5% promoted** — and the durable tier is half a percent of the bytes. Only 25 of the 334 tagged entries (7%) concern the harness itself rather than a project's task work.

That ratio is worth pausing on, because it independently reproduces a finding from the prime-agent investigation: its Continual Harness held 82 local entries that promoted to 4 global memories — the same ~5%, and the same conclusion that the local tier reads as a work log. Two unrelated memory systems, the same promotion rate, means the failure is structural rather than a quirk of either implementation. Neither needs better collection; both need a promotion step that does not depend on someone remembering to do it.

The bulk of the daily tier is automatic: `PI_MEMORY_EXIT_SUMMARY` is enabled, writing a Decisions / Lessons / Notes / Follow-ups block at every session end. That is a work log by construction, which also explains why the 42 auto entries sit in the same tier as the 326 hand-tagged ones.

**What this adds to the answer — and a recommendation this data refutes.** I first suggested promoting memory entries by recurrence, the same rule the failure report uses. Testing it on the store rejects that:

- 82 near-duplicate clusters cover 249 of 334 entries, so recurrence has plenty of material to bite on.
- But the recurring terms are `review` (134), `just` (118), `squash-merged` (75), `beyoglu` (65), `tests` (67), `frontend` (81) — project delivery, not harness lessons. Of 2,283 recurrent terms, **16 are harness-related (1%)**.
- Restricting to harness entries does not rescue it: only **25 of 334 entries (7%)** mention harness concepts at all, and their recurrent terms are still generic workflow verbs — `tests` (16), `review` (12), `committed` (12), `checks` (12).

The store's own tag taxonomy says the same thing: `decision` 104, `review` 96, `frontend` 71, `project-conventions` 29, `lesson` 28. It is organised as project delivery documentation. **There is no harness material in memory to promote**, so the promotion step is not a weak mechanism here — it is a mechanism with nothing to work on.

The corrected conclusion: memory is not a second source for harness improvement, and trying to make it one would mean adding a capture path for harness lessons — which the prompt-surface measurement argues against, for a corpus where every recurring defect turned out to be mechanical. The session log remains the instrument, and counting remains the method.

### What is worth keeping

The record store, and a periodic re-run of the report. That is the whole loop:

- The extractor rebuilds 10,825 files into 5,600 records in about 55 seconds, incrementally.
- Records carry counts, hashes, durations, and redacted signatures — no prompt text or tool output leaves the machine, so the corpus can be analysed and later re-analysed without re-exposing it.
- `report.mjs` ranks recurrences, which is enough to choose the next fix.
- The falsification test closes each fix: re-run, and check the signature leaves the table. Verified once already — the removed-skill signature's last occurrence is `2026-10-17T19:16Z`, before the fix, with no occurrence in the sessions that followed.

What is *not* worth adding is a model-driven refinement layer over prompts and skills. It would target the quarter of failures that recur while costing a model call per candidate, and the recurring quarter is already solved faster by counting. Prime-agent's `/refine` shows the failure mode: with a single trajectory and no counterfactual, its local tier degenerates into a work log rather than lessons — the same trap, one level up.

The lifetime measurement above closes the argument. Recurring defects have a median life of 35 days and a lower quartile of 10, while any convergence loop needs repeated occurrences plus a probe budget before it can decide anything. It would spend most of its budget learning patterns that are already stopping, and it cannot distinguish a repair from a removed capability — 46 of the 113 large signatures ended when the tool did. Detection latency, not learning, is the lever, and weekly counting delivers it for free.

The prompt-surface measurement above settles it on price as well as on yield. A reflective loop needs tools and context to run, and every declared tool costs its description length × every request — the existing surface already takes ~5% of tokens in the sessions that can be measured. Adding machinery to chase defects worth 0.3% of calls inverts the economics.

The honest conclusion: **the corpus is a diagnostic instrument, not a control loop.** Its value is that it makes cheap, unglamorous defects visible. The only automation it justifies is the 55-second extraction and a monthly look at the table.

## Concrete changes this supports

1. ~~Reconcile the skill trees.~~ Done: references dropped, five dangling symlinks removed, catalog left as pruned. **Verified:** the signature's last occurrence is `2026-10-17T19:16Z`, before the fix, and none of the sessions started afterwards hit it.
2. **Decide the `reasoning` wiring.** Largest identified single cause, verified as a one-line gating defect rather than a deliberate requirement. See Class 2. **Open — yours to call**, because it changes agent behaviour.
3. **Fix `project-atom/AGENTS.md` skill links.** Repo-root-relative paths break whenever the working directory is a subdirectory or worktree. The skills exist; the paths do not resolve. Separate repository, so left alone.
4. Add quota pre-checks to the `agy_execute` routing path, and teach the workflow docs about the pre-commit and push-hook rejections.
5. **Trim the heaviest tool descriptions.** The largest measurable lever: nine extensions account for ~6,100 of ~14,700 schema tokens per prompt in a scan of recent sessions, re-sent every request. De-risked above — declaration size shows no relationship to argument-error rate (+0.13), so the text is not carrying that load. `web_search`, `mcp`, `agy_execute`, `fetch_content`, and `herdr_agent` are the top five.
6. **Guard `agy_execute` on both axes.** It is the corpus's worst error rate (42.9%) and its only real latency outlier (52 hours, ~4 min per call). A quota pre-check and a shorter timeout address both at once.
6. **Run the report weekly, not monthly.** Recurring defects have a median 29-day lifetime, so monthly detection catches them as they retire. Extraction is incremental; the marginal cost of a weekly run is seconds. Work the *Still occurring* table from the top.
7. Re-run after any fix and check the signature leaves the recurring table. `lib.mjs` carries `EXTRACTOR_VERSION`; bumping it forces a full re-extract, about 55 seconds across all three machines.
8. Re-running is the cadence that matters, and it is now one command: `pi/agent/harness-mining/mine.sh` refreshes all three machines and regenerates the report in **about 24 seconds** end to end. Verified idempotent — replaying the full pipeline leaves the report byte-identical apart from its generation timestamp. Verified incremental — with nothing changed, extraction reports 7,900 of 7,902 unchanged in **0.28 s** while still catching the two sessions that had grown. The runner fails loudly if a machine is unreachable, because an empty stream would otherwise let the report keep using that machine's stale records while appearing complete.

Deliberately out of scope: the `.gemini`, `.claude`, `.codex`, `.factory`, and `.commandcode` session stores belong to other harnesses and would each need their own adapter.
