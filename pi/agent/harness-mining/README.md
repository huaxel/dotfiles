# harness-mining

Mine your pi session logs for recurring harness defects. Two scripts, no dependencies,
no model calls:

```sh
node extract.mjs            # session JSONL → one small record per session
node report.mjs             # records → out/report.md
```

Extraction over the 10,825 session files on all three machines takes about 55 seconds.

## What this is for

A session log is evidence about the harness, not just about the task. This turns the
corpus into a ranked list of *the same failure happening over and over*, which is the
only kind of defect worth fixing in a prompt, a skill, or an extension.

The output is a list of **hypotheses**, never findings. No session was ever run twice
with and without a harness change, so nothing here has a counterfactual. Recurrence
tells you where to look. Only a paired arm tells you whether a change helped — upstream
`packages/evals` already implements two-arm runs and lift, so use it for the few
candidates worth measuring.

The gate before editing anything: the signature must recur across several distinct
sessions, and the change must target a harness artifact (`AGENTS.md` section, a
`SKILL.md`, an extension, a prompt template). Acting on singletons is what turns a
harness store into a work log.

## Privacy

Records contain counts, hashes, durations, redacted signatures, and cwd. The extractor
does not write prompt text, tool output, or message content to `out/`.

`out/error-text.json` is the one exception: it maps a hash to the redacted first line of
a failing tool result, purely so the report can name why something failed. It stays on
this machine, `out/` is gitignored, and `--no-error-text` skips it entirely.

Redaction replaces secret-shaped strings (env assignments, bearer tokens, provider key
prefixes, long base64 runs) while preserving readable filenames and paths, so that
`the-parser-rewrite-notes.md` survives but `sk-proj-…` does not.

## Recurring run

One command refreshes everything and regenerates the report:

```sh
pi/agent/harness-mining/mine.sh                    # every host in PI_MINE_HOSTS
PI_MINE_HOSTS="arch-wsl" mine.sh                   # one host
PI_MINE_HOSTS="" mine.sh                           # this machine only
```

Measured end to end: **about 24 seconds** for three machines, because unchanged
sessions are skipped. Extraction alone with nothing changed takes 0.28 s.

**Why it fails loudly instead of quietly.** An unreachable host produces an empty
stream and no error of its own, so the pipeline would report success while the report
kept using that host's previous records — stale data presented as current. `ingest.mjs`
therefore takes `--expect-machine <name>` and exits 2 if an expected machine delivers
nothing. Without any expectation, an empty stream is also an error. If you replace the
pipeline with your own, keep that check.

## Usage

```sh
node extract.mjs --limit 40          # last 40 sessions, for a quick look
node extract.mjs --force             # re-extract everything, ignoring the cache
node extract.mjs --no-error-text     # no reason strings on disk
node report.mjs --top 50             # longer recurring-failure table
node report.mjs --active-days 7      # narrower "still occurring" window (default 30)
```

The recurring table ranks by distinct sessions across the whole corpus, which mixes
live defects with patterns that stopped months ago. Every row carries a **`last seen`**
date, and a *Still occurring* table lists the subset that fired inside the active
window — that subset is what to fix next. On the current corpus, 285 of 883 recurring
signatures are still live.

Extraction is incremental: `out/index.json` records mtime and size per session, so a
re-run only touches what changed. Bump `EXTRACTOR_VERSION` in `lib.mjs` when the record
schema or a normalization rule changes, and the next run re-extracts everything.

### Scan both session roots, and deduplicate

A machine usually has two pi session stores — `~/.pi/agent/sessions` (runtime) and
`~/dotfiles/pi/agent/sessions` (the dotfiles copy). They are not consistently nested:
on one machine the runtime store is a strict superset, on another it is entirely
duplicate. Pass both:

```sh
node extract.mjs --sessions ~/dotfiles/pi/agent/sessions --sessions ~/.pi/agent/sessions
```

The stores hold **10,825 files for 5,600 distinct sessions** on these three machines:
the runtime directory keeps several files per conversation. `report.mjs` collapses
duplicates by session-header id, keeping the most complete record, and reports both
counts. Without that step every number is inflated by roughly 9%.

### Other machines

`bundle.mjs` builds the extractor into a single ESM file that runs through stdin, so
another machine needs neither this directory nor any file written to its disk. Records
stream back as NDJSON and `ingest.mjs` files them locally with a machine-name prefix:

```sh
node bundle.mjs > /tmp/harness-mining.mjs
ssh other-machine "node --input-type=module - --stdout --machine other-machine \
  --sessions ~/dotfiles/pi/agent/sessions --sessions ~/.pi/agent/sessions" \
  < /tmp/harness-mining.mjs | node ingest.mjs --expect-machine other-machine
```

Every remote run must pass `--sessions` explicitly: the script's default resolves from
`import.meta.url`, which does not exist when Node reads from stdin. `ingest.mjs` merges
the reason map into `out/error-text.json` and does not touch `index.json`, which tracks
this machine's own sessions only.

Never copy session directories between machines. Records are kilobytes; transcripts are
gigabytes, and they are the sensitive artifact.

Deduplicating the *same task* run on two machines is not implemented: `cwd` plus
`firstUserHash` is the intended key if it becomes necessary.

## Record schema (version 1)

| field | meaning |
| --- | --- |
| `formatVersion`, `id`, `cwd`, `parentSession` | from the session header |
| `machine`, `file` | which store the record came from; `id` is the dedupe key |
| `startedAt`, `endedAt`, `durationMinutes` | session span |
| `counts`, `totalMessages` | entries by message role || `calls`, `errors`, `toolCallCount`, `toolErrorCount` | tool calls and failures by tool |
| `toolCallMs`, `slowCalls` | tool latency; calls with no result are not counted |
| `failing` | `{sig, tool, n, reasons}` — failures deduped within the session |
| `compactions`, `modelChanges`, `thinkingLevelChanges` | harness churn |
| `models`, `thinkingLevels` | provider/model and thinking level in effect |
| `sections` | section name → hash of its text; `null` entries removed |
| `sectionSetHash`, `toolSetHash`, `toolsDeclared` | harness configuration fingerprint |
| `tokens`, `cost` | summed usage and recorded cost |
| `customTypes` | extension-written session entries by `customType` |
| `stopReasons`, `parseErrors` | assistant stop reasons; unparseable lines |

## Known limits

- **Figures are a snapshot.** Sessions are appended while an analysis runs, so counts
drift between extractions. Re-extract before quoting a number; the incremental skip
makes that seconds for unchanged files.
- **The extractor has been independently verified.** A Python recount of 60 sessions
using a different parsing path, compared against every record sharing a session id,
reproduced tool calls, errors, compactions, messages, and failing-hit totals exactly.
An earlier run showed five mismatches, all of which were stale snapshots of sessions
appended after extraction rather than extractor defects.
- **Deduplication is safe, verified corpus-wide.** Of 5,600 session ids, 3,456 appear
as more than one file, and none of those copies disagree on tool calls: the
most-complete and least-complete rules both total 825,847. Duplicates are true copies.
- **Harness attribution is partial.** Prompt sections are persisted only by recent pi
  versions. Across all three machines, 646 of 5,930 sessions carry a fingerprint (earliest
  2026-09-20) spread over 401 distinct fingerprints — far too sparse to correlate
  configuration with outcome. Attribution accrues on every new session, so the value is
  forward-looking: keep the records and the corpus becomes correlatable later.
- **Configuration rows are confounded** even over the attributed subset. A low error
  rate may mean the configuration is good, or that it was used on easy work.
- **Error rate is not harm.** `grep` exiting 1 for "no matches" is recorded as an error.
  Some high-frequency signatures are tool semantics rather than defects.
- **`bash` signatures are shape-normalized**, so `cd P && just ci` collapses across
  repositories. Use the `top cwd` column to see where a signature concentrates.
- Subagent transcripts under `subagents-herdr/` are not part of `sessions/` and are not
  extracted.
- **Records grow with the corpus.** 10,825 session files produce ~55 MB of records today.
