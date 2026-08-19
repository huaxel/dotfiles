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
