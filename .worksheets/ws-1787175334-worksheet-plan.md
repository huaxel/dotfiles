# Worksheet Plan — 2026-08-19 23:35

## Task

Continue evolving Pi toward a document-first coding-agent experience, using shared Markdown documents as the primary collaboration surface.

## Human notes

The terminal currently gives most of its space to agent traces and tool calls, while the prompt is cramped. The goal is to collaborate through document additions, removals, comments, questions, and todos, while keeping the terminal as an execution/status view.

## Todos

- [x] Design the section-aware update format.
- [x] Define stable semantics for comments, questions, and todo transitions.
- [x] Add focused extension tests with a reusable Pi extension harness.
- [x] Prototype the workflow on one real coding task.

## Progress

- [x] Implemented the worksheet watcher and feedback-loop guard.
- [x] Added pause/resume and `/worksheet attach path/to/document.md`.
- [x] Added document sections for human notes, todos, findings, decisions, and questions.
- [x] Added addition/removal summaries to worksheet steering messages.
- [x] Committed implementation as `7e5e87b`.
- [x] Added the milestone roadmap to `ws-1787173918-document-workspace.md`.
- [x] Implemented the durable audit sidecar (`.history/<id>/events.jsonl`) with revision id, parent, actor (human/agent), changed sections, operation summary, changed block ids, conversation/turn id; whitespace-only saves skipped.
- [x] Implemented stable block identities via content+heading similarity reconciliation; ids persisted out-of-band in `block-ids.json`.
- [x] Added `worksheet-loop.test.mjs` regression tests for the block-identity core.
- [x] Gitignored the regenerable audit sidecar (`.worksheets/.history/`); updated DESIGN/DECISIONS/ROADMAP docs.
- [x] Added the reusable Pi extension test harness `pi-test-harness.mjs` (makePiHarness/makeCtx/fakeClock/tempDir/runTests/assert/registerResolveHook), self-tested in `harness.test.mjs` and adopted by `restart.test.mjs` (removed duplicated mock).
- [x] Defined stable semantics for comments/questions/todos (Markdown-native contract): comments = `> ` blockquotes (human-owned input, Pi appends under `## Agent response`); questions = `## Questions / Next steps` items ending in `?` (tick to close, delete to un-plan); todos = `- [ ]` open / `- [x]` done-claim-to-verify, flip-back = reopen. Encoded checkbox-transition detection (`todoTransitions`) with a `Semantics:` steering call-out and `semantics` audit field; codified in SKILL.md and DESIGN.md.
- [x] Prototyped the workflow on a real coding task: `ws-1787515932-clean-todos-lint.md` cleaned the four pre-existing `deno lint` warnings in `todos.ts` (require-await ×2, no-explicit-any, no-unused-vars) via the worksheet loop. The task ran plan→implement→verify→record entirely through the worksheet: todos tracked check/close transitions, progress/findings/decisions appended, and `just ci` went from flagging todos.ts to a clean gate. Validates M2 semantics + the audit sidecar on real work (the `.history` event log captured each revision), and exercises M4 validation criteria (a real task start-to-finish).
- [x] Formally specified the section-aware update format in `pi/agent/document-workspace/SECTION-AWARE-FORMAT.md` — the section model (heading keys + occurrence), change detection, steering message shape (bounded 12-section/80-line caps, current-section echo, optional `Semantics:` layer), audit event schema (revision/parent/actor/sections/ops/blocks/semantics/conversation/turn/ts), design decisions, and known limits. Linked from README; roadmap M2 marked green.
- [x] Began M3 (attention routing): added a compact worksheet footer status via `ui.setStatus` — watcher state (⏸/📄), active worksheet name, and open todo/question counts as a document pointer. Hooked into session_start, human saves, and start/attach/pause/resume commands. Pure `worksheetCounts` focused counter exported + tested (note: a checkbox ending in `?` is a *question-todo*, counted as a todo, not an open question). Check/lint clean, all tests pass.
- [x] Continued M3: added **document-first mode** (`/worksheet mode on|off`, default on when a worksheet exists). When on, a `DOCUMENT_FIRST_DIRECTIVE` is appended to the system prompt (via pure `buildSystemPrompt`) enforcing attention routing: substantive answers go in the worksheet, the TUI stays a status/execution/error/interrupt surface, no duplication across channels. Footer status shows `doc`/`chat`. Pure directive-injection logic unit-tested (`worksheet-mode.test.mjs`); real-loader load check passes. Check/lint clean, all 8 test suites + ci green.
- [x] Completed M3 (attention routing): made the steering message **mode-aware** via pure `buildSteeringMessage` — document-first mode sends a compact `[Worksheet update — file] Saved changes. Open the worksheet…` pointer instead of inlining the section diff (TUI no longer duplicates the document; the diff still lands in the audit `ops`). Normal mode keeps the full section diff for inspection. Unit-tested. Roadmap M3 marked fully green.
- [x] Began M4 (real workflow validation): wrote `FAILURE-MODES.md` — the failure modes & recovery playbook grounded in the actual extension code paths (self-injection guard, stale `.ws-lock` 30s safety-net, debounce races, best-effort audit sidecar, missed watcher events, reload double-wiring, whitespace churn, doc-first quiet TUI) plus a recovery cheat-sheet and a validation checklist for live tests.
- [x] Completed the research follow-ups: wrote `RESEARCH.md` from primary sources — pi-watcher's marker/queue semantics (`AI!`/`AI?`/`AI.`, `queue_until_idle`, consumed-marker loop prevention) vs the worksheet loop (sentinel+hash, section-aware steering); Cairn's archive/rationale conventions (`.cairn/archive/`, `HUMAN.md` handoff, decision status transitions, provenance chains); and pi-doc-review's Glimpse review-window fit as an optional M4 writing/review surface (not a dependency). Implication: borrow `queue_until_idle`, add explicit decision transitions + archive sweep, keep pi-doc-review optional.

## Findings

- The current extension is a transport layer and document protocol prototype, not yet a replacement for the Pi TUI.
- Sending both a change summary and the current document makes deletions visible, but section-aware updates are the next scalability step.
- Explicitly attached Markdown files let the workflow remain editor-agnostic.

## Decisions

- Keep the terminal transcript as an execution/debug view rather than deleting it.
- Treat the shared document as the durable task state and primary authoring surface.
- Preserve human-owned notes and append agent-owned progress, findings, decisions, and questions.
  Maybe thru formatting to distinguish them?
- Treat Zed as architectural inspiration, not a dependency: begin with save-level deltas, stable block IDs, optimistic concurrency/three-way section merges, and an audit trail; defer full CRDT text editing and network multiplayer.

## Questions / Next steps

- Decide whether comments should use Markdown sections, HTML comments, or both

I'd stay Markdown centric.

- Decide how deleted or rejected suggestions should remain auditable.

idk yet
explain more

- Decide whether session and project documents need separate roles.

that's a good question but for now we can just have ./worksheets in a project and you reference them, maybe providing a fast search of these?

- Prototype a `.worksheets/.history/<worksheet-id>/events.jsonl` sidecar with revision ID, parent revision, actor, changed sections, operation summary, and conversation/turn ID. ✅ Implemented in `worksheet-loop.ts` (see Progress/Decisions).
- Define stable identities for todo/question/decision blocks before relying on heading occurrence keys; keep IDs out of the visible Markdown where possible. ✅ Implemented (content+heading similarity reconciliation, ids in `block-ids.json` sidecar).

## Agent response

- Agreed: keep the protocol Markdown-native; no hidden HTML comment syntax is required for the first version.
- Implemented `/worksheet list`, `/worksheet search <text>`, and named worksheet lookup with `/worksheet open [name]` and `/worksheet path [name]`.
- For auditability, a deletion should remove an item from the active plan, while a short rejection/supersession note remains under `## Decisions` or `## Progress`. The change summary exposes the deletion; the durable note preserves why it happened.
- The project-local `.worksheets/` directory is the initial document index. Search is intentionally local and fast rather than trying to infer a global active document.

### Clarification from Discord feedback
This is not a request to stream every keystroke or expose the model’s hidden input/thinking stream. Saved document revisions are the interaction events, but saving should itself steer Pi without requiring a separate prompt. The document is a persistent, bidirectional task surface; `git diff` is only one implementation detail for describing changes. In fact, Git is the wrong boundary for this: documents may be untracked, gitignored, generated, or never committed, while still being active collaboration state.

### Markdown and attention design
Markdown is robust enough as the human-facing medium, but not as the entire protocol. It needs a small convention layer for ownership, todos, questions, decisions, and durable progress. The larger UX risk is duplicate attention: substantive answers should have one canonical home in the worksheet, while the TUI should show compact status, blocking questions, errors, and explicit interruptions.

### Prior art scan
- `pi-watcher` is the closest Pi-native trigger model: saved `AI!`, `AI?`, and `AI.` comments dispatch focused work, with queueing and loop prevention.
- `pi-simplewatcher` provides active/passive filesystem watches, especially for agent inboxes, but does not define a document collaboration protocol.
- `pi-doc-review` provides a Markdown review window with comments and raw edits, but is review-oriented rather than a persistent task workspace.
- `pi-plan-extension` persists plans and tracks checklist execution, but remains plan-mode oriented.
- Outside Pi, Cairn and agent-work-mem explore Markdown files as shared agent/human state; Moment is a fuller collaborative Markdown workspace with embedded agents.
- No single Pi package found combines editor-agnostic shared documents, saved-revision steering, bidirectional writes, durable task semantics, and TUI attention routing.
- Created `pi/agent/document-workspace/` with design, roadmap, decisions, and future-session instructions.
- Implemented section-aware worksheet updates: Pi now receives changed Markdown sections and bounded additions/removals instead of the full document.
- Zed CRDTs suggest stable logical anchors, actor/causal ordering, tombstones, and per-author undo; these map to worksheet revisions and durable item identity, but character-level CRDT replication is unnecessary for save-level Markdown events.
- Zed DeltaDB suggests an append-only operation/delta history that links each edit to the conversation or agent turn, while keeping a materialized real worktree. This fits the worksheet as a human-readable view over a small sidecar event log.
