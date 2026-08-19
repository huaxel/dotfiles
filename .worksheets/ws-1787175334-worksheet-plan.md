# Worksheet Plan — 2026-08-19 23:35

## Task

Continue evolving Pi toward a document-first coding-agent experience, using shared Markdown documents as the primary collaboration surface.

## Human notes

The terminal currently gives most of its space to agent traces and tool calls, while the prompt is cramped. The goal is to collaborate through document additions, removals, comments, questions, and todos, while keeping the terminal as an execution/status view.

## Todos

- [ ] Design the section-aware update format.
- [ ] Define stable semantics for comments, questions, and todo transitions.
- [ ] Add focused extension tests with a reusable Pi extension harness.
- [ ] Prototype the workflow on one real coding task.

## Progress

- [x] Implemented the worksheet watcher and feedback-loop guard.
- [x] Added pause/resume and `/worksheet attach path/to/document.md`.
- [x] Added document sections for human notes, todos, findings, decisions, and questions.
- [x] Added addition/removal summaries to worksheet steering messages.
- [x] Committed implementation as `7e5e87b`.
- [x] Added the milestone roadmap to `ws-1787173918-document-workspace.md`.

## Findings

- The current extension is a transport layer and document protocol prototype, not yet a replacement for the Pi TUI.
- Sending both a change summary and the current document makes deletions visible, but section-aware updates are the next scalability step.
- Explicitly attached Markdown files let the workflow remain editor-agnostic.

## Decisions

- Keep the terminal transcript as an execution/debug view rather than deleting it.
- Treat the shared document as the durable task state and primary authoring surface.
- Preserve human-owned notes and append agent-owned progress, findings, decisions, and questions.
  Maybe thru formatting to distinguish them?

## Questions / Next steps

- Decide whether comments should use Markdown sections, HTML comments, or both

I'd stay Markdown centric.

- Decide how deleted or rejected suggestions should remain auditable.

idk yet
explain more

- Decide whether session and project documents need separate roles.

that's a good question but for now we can just have ./worksheets in a project and you reference them, maybe providing a fast search of these?

## Agent response

- Agreed: keep the protocol Markdown-native; no hidden HTML comment syntax is required for the first version.
- Implemented `/worksheet list`, `/worksheet search <text>`, and named worksheet lookup with `/worksheet open [name]` and `/worksheet path [name]`.
- For auditability, a deletion should remove an item from the active plan, while a short rejection/supersession note remains under `## Decisions` or `## Progress`. The change summary exposes the deletion; the durable note preserves why it happened.
- The project-local `.worksheets/` directory is the initial document index. Search is intentionally local and fast rather than trying to infer a global active document.

### Clarification from Discord feedback
This is not a request to stream every keystroke or expose the model’s hidden input/thinking stream. Saved document revisions are the interaction events, but saving should itself steer Pi without requiring a separate prompt. The document is a persistent, bidirectional task surface; `git diff` is only one implementation detail for describing changes. In fact, Git is the wrong boundary for this: documents may be untracked, gitignored, generated, or never committed, while still being active collaboration state.

### Markdown and attention design
Markdown is robust enough as the human-facing medium, but not as the entire protocol. It needs a small convention layer for ownership, todos, questions, decisions, and durable progress. The larger UX risk is duplicate attention: substantive answers should have one canonical home in the worksheet, while the TUI should show compact status, blocking questions, errors, and explicit interruptions.
