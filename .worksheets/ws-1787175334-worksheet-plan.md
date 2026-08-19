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

## Questions / Next steps
- Decide whether comments should use Markdown sections, HTML comments, or both.
- Decide how deleted or rejected suggestions should remain auditable.
- Decide whether session and project documents need separate roles.
