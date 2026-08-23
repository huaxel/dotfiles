# Decisions

## 2026-08-19 — Markdown is the primary human surface

Use ordinary Markdown as the collaboration medium. Prefer headings, paragraphs, blockquotes, and checkboxes over hidden HTML metadata or editor-specific syntax.

## 2026-08-19 — Saved revisions, not keystrokes

The workflow does not stream every keystroke into the model. A saved meaningful revision is the interaction event, and saving should steer Pi without a second copy-pasted prompt.

## 2026-08-19 — Git is not the boundary

Worksheets may be untracked, gitignored, generated, or never committed. The extension watches filesystem documents directly.

## 2026-08-19 — One canonical home for substantive work

Plans, findings, decisions, questions, and durable progress belong in the worksheet. The TUI remains an execution/status/interrupt surface and should not duplicate full document answers in document-first mode.

## 2026-08-19 — Keep rationale before deletion

Deleting an active item is allowed, but important rejection or supersession rationale should be recorded under `## Decisions` or `## Progress` before removal.

## 2026-08-23 — Durable audit sidecar (`events.jsonl`) with stable block ids

Revisions are recorded to an append-only `events.jsonl` per worksheet with revision id, parent revision, actor (human/agent), changed section keys, operation summary, changed block ids, conversation and turn id. Block identity is reconciled across saves from content+heading similarity so edits, renames, and reordering do not churn ids — idempots live in the sidecar, never in the visible Markdown. This follows Zed's DeltaDB (append-only deltas over a real worktree) and logical-anchor lessons from the worksheet research, without full CRDT text replication.

## 2026-08-24 — Stable semantics for comments, questions, todos

Markdown-native contract, no hidden HTML metadata:
- Comments are `> ` blockquotes; `## Human notes` is human-owned, Pi appends under `## Agent response`.
- Questions are `## Questions / Next steps` items ending in `?`; ticking one closes/answers it, deleting one removes it from the plan (answer first if open).
- Todos: `- [ ]` open work, `- [x]` a done claim to verify (not proof); flipping back to `- [ ]` is a reopen.
The extension detects checkbox transitions and surfaces them as a `Semantics:` call-out plus a `semantics` audit field, so Pi needn't re-derive meaning from a raw diff. Codified in SKILL.md and DESIGN.md.

## 2026-08-24 — Document-first mode (M3 attention routing)

Substantive responses belong in the worksheet; the TUI is a status/execution/error/interrupt surface. `/worksheet mode on|off` toggles it (default on when a worksheet exists). When on, a `DOCUMENT_FIRST_DIRECTIVE` is appended to the system prompt via the pure `buildSystemPrompt()` helper, enforcing: findings/decisions/progress go in the worksheet, TUI prose stays short with document pointers, quick clarifications can stay in chat, and no content is duplicated across both channels.
