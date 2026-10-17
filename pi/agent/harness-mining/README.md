# harness-mining

Mine your pi session logs for recurring harness defects. Two scripts, no dependencies,
no model calls:

```sh
node extract.mjs            # session JSONL → one small record per session
node report.mjs             # records → out/report.md
```

Extraction over the 5,930 sessions on all three machines takes about 35 seconds.

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

## Usage

```sh
node extract.mjs --limit 40          # last 40 sessions, for a quick look
node extract.mjs --force             # re-extract everything, ignoring the cache
node extract.mjs --no-error-text     # no reason strings on disk
node report.mjs --top 50             # longer recurring-failure table
```

Extraction is incremental: `out/index.json` records mtime and size per session, so a
re-run only touches what changed. Bump `EXTRACTOR_VERSION` in `lib.mjs` when the record
schema or a normalization rule changes, and the next run re-extracts everything.

### Other machines

`bundle.mjs` builds the extractor into a single ESM file that runs through stdin, so
another machine needs neither this directory nor any file written to its disk. Records
stream back as NDJSON and `ingest.mjs` files them locally with a machine-name prefix:

```sh
node bundle.mjs > /tmp/harness-mining.mjs
ssh other-machine "node --input-type=module - --stdout --machine other-machine \
  --sessions ~/dotfiles/pi/agent/sessions --sessions ~/.pi/agent/sessions" \
  < /tmp/harness-mining.mjs | node ingest.mjs
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
- **Records grow with the corpus.** 5,930 sessions produce ~30 MB of records today.
