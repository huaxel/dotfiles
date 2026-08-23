# Worksheet loop — failure modes & recovery playbook

Status: M4 validation deliverable. Grounded in `worksheet-loop.ts` behavior;
use it to reproduce, diagnose, and recover from failures during real workflow
validation.

## Architecture recap (what can fail)

The loop is: human saves a Markdown file → `fs.watch` fires → debounce (400ms) →
`recordRevision` (hash check, section diff, audit event, block-id reconcile) →
steering `sendUserMessage`. Agent writes are guarded by a process-local flag +
cross-process `.ws-lock` sentinel with a 30s crash safety-net. The audit sidecar
(`.worksheets/.history/<id>/`) is best-effort storage.

## Failure modes

### 1. Agent-write feedback loop (self-injection)

- **Symptom**: Pi re-steers on its own worksheet write — you see the agent's own
  edit come back as a `[Worksheet update]` message.
- **Cause**: the guard missed (sentinel absent) when the agent's write completed.
  Historically, a 1s crash-safety timer was too short — the edit tool + fs.watch
  delivery took ~1.025s, so the parent injected.
- **Current defense**: 30s timer + disarm on `tool_execution_end` + hash refresh
  on guarded skip.
- **Recovery**: if it happens, `/worksheet pause`, let the stale sentinel age out
  (30s) or remove `.worksheets/.ws-lock`, then `/worksheet resume`. The hash
  bookkeeping prevents a re-inject of the same content.

### 2. Stale lock / sentinel after a crash

- **Symptom**: `.worksheets/.ws-lock` lingers; future writes are skipped as
  "guarded" even though no agent is writing.
- **Cause**: the process died mid-write before `disarm()`.
- **Current defense**: the 30s timer unlinks the sentinel on the *same process*;
  the watcher also checks sentinel age and unlinks anything ≥30s old.
- **Recovery**: wait 30s (auto-clean), or `rm .worksheets/.ws-lock` manually and
  `/worksheet resume`. Verify no other pi session is actually writing first.

### 3. Debounce race (file removed mid-read)

- **Symptom**: a save is missed or an error is swallowed.
- **Cause**: the file disappeared between `fs.watch` firing and the debounced
  `readFileSync`.
- **Current defense**: every read is in a `try/catch` with `// raced` handling;
  `recordRevision` returns `null` on missing file.
- **Recovery**: re-save the file; the next `fs.watch` event re-triggers. No data
  loss — the source is the editor's buffer.

### 4. Audit sidecar write failure

- **Symptom**: `.history/<id>/events.jsonl` missing entries or a stale
  `block-ids.json`.
- **Cause**: disk full, permission, or the directory raced.
- **Current defense**: all sidecar writes are best-effort (`catch { /* storage
  is best-effort */ }`); a failure never blocks steering.
- **Recovery**: the visible Markdown is authoritative — the sidecar is
  regenerable. Re-run a save to append the next event; optionally delete the
  `.history/<id>` dir to start a fresh chain (identity remaps; ids will be
  re-derived).

### 5. Watcher missed an event

- **Symptom**: an edit isn't steered even though it saved.
- **Cause**: `fs.watch` is inotify/FSEvents-based and can drop events under
  heavy load, or the file was written+rewritten within the debounce window.
- **Current defense**: debounce coalesces; `scheduleAllFiles` rescan on
  `session_start` and `/worksheet resume`.
- **Recovery**: `/worksheet resume` (rescans all files) or touch the file again.
  `just ci`-style batch edits are fine; the hash check only steers meaningful
  content changes.

### 6. Extension reload double-wiring

- **Symptom**: two watchers or doubled steering after `/worksheet`-triggered
  reload.
- **Cause**: `session_start` can fire more than once on reload.
- **Current defense**: `closeWatcher?.()` at the top of `session_start` closes
  the old watcher first.
- **Recovery**: none needed — it self-heals; if doubled output persists, restart
  pi (the watcher is per-process).

### 7. Whitespace-only / formatting churn

- **Symptom**: no steering for a save that "looks changed".
- **Cause**: normalized hash (all whitespace collapsed) suppresses formatting-only
  changes.
- **Defense/recovery**: intentional — not a failure. Content changed? Re-save a
  real edit.

### 8. Document-first mode side effects

- **Symptom**: TUI seems "too quiet" — saves produce only a compact pointer.
- **Cause**: M3 attention routing — this is the intended behavior.
- **Recovery**: `/worksheet mode off` for full section diffs in the TUI.

## Recovery cheat-sheet

| Symptom | Action |
|---|---|
| Self-injection | `/worksheet pause` → clear `.ws-lock` if needed → `/worksheet resume` |
| Stale lock | wait 30s or `rm .worksheets/.ws-lock` → `/worksheet resume` |
| Missed steer | `/worksheet resume` (rescans) or re-save the file |
| Sidecar corrupt | delete `.history/<id>/` (regenerable) |
| TUI too quiet | `/worksheet mode off` |
| Doubled output | restart pi (watcher is per-process) |

## Validation checklist (run during real workflow tests)

- [ ] Save a human edit → steering arrives (compact pointer in doc-first mode).
- [ ] Agent writes a worksheet → no self-injection (guard holds).
- [ ] Kill pi mid-write → sentinel cleans up within 30s; next session works.
- [ ] Rapid successive saves → debounce coalesces to one steer.
- [ ] Whitespace-only save → no steer.
- [ ] Delete a worksheet mid-edit → no crash; re-save recovers.
- [ ] `/worksheet mode off` → full section diff returns.
- [ ] `.history/<id>/events.jsonl` appends one event per meaningful save.
