# Document Workspace — 2026-08-19

## Task
Evolve the worksheet-loop extension into a stronger document-centered collaboration workflow for Pi.

## Progress
- Reviewed the current watcher, steering, write-guard, and worksheet command flow.
- Identified the first design priorities: explicit shared-document semantics, reliable watcher state, and focused human/agent ownership.
- Implemented real pause/resume commands with a rescan on resume.
- Made debouncing per worksheet so rapid edits to different documents are not lost.
- Added watcher cleanup on reload/session shutdown.
- Updated the worksheet skill to treat saved edits as steering input and persist durable progress.
- Added `Human notes`, `Todos`, `Findings`, `Decisions`, and clearer ownership guidance to new worksheets.
- Added line-level addition/removal summaries so human deletions and replacements become visible to Pi.
- Added `/worksheet attach path/to/document.md` for existing project documents.
- Smoke-tested worksheet edits, attached-file edits, pause/resume, and deletion summaries.
- `just ci` passes; ShellCheck and Deno checks are skipped because they are unavailable locally.

## Human direction
The deeper goal is to rethink the coding-agent experience: the terminal currently gives most space to agent traces and tool calls, while the prompt input is cramped and uncomfortable. Shared session/project documents could become the primary interaction surface, with the human and Pi collaborating through additions, removals, comments, questions, and todos.

## Milestones

### M1 — Shared document transport ✅
- [x] Watch saved Markdown changes.
- [x] Feed human changes back to Pi as steering input.
- [x] Prevent agent-write feedback loops.
- [x] Support pause/resume and attached project documents.

### M2 — Document interaction protocol 🟡
- [x] Define human-owned notes and agent-owned durable state.
- [x] Add todos, findings, decisions, and questions to new worksheets.
- [x] Report additions and removals to Pi.
- [ ] Make updates section-aware instead of sending the whole document.
- [ ] Define stable semantics for comments, questions, and todo transitions.

### M3 — Document-first coding-agent UX ⬜
- [ ] Prototype a compact terminal/status view.
- [ ] Make the shared document the primary task-authoring surface.
- [ ] Keep the terminal transcript available as an execution/debug view.
- [ ] Evaluate whether the prompt can become a minimal command/interrupt surface.

## Active todos
- [ ] Design the section-aware update format.
- [ ] Add focused extension tests with a reusable Pi extension harness.
- [ ] Prototype the document-first interaction loop on one real coding task.

## Questions / Next steps
- Decide whether comments should use Markdown sections, HTML comments, or both.
- Decide how deletions and rejected suggestions should be represented durably.
- Decide whether one active document is enough or whether session/project documents need separate roles.
