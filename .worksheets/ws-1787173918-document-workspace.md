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

## Questions / Next steps
- Reframe the worksheet loop as the foundation for a document-first coding-agent mode, not merely a watcher.
- Define the interaction model for comments, questions, and todo state before adding more commands.
- Define the document interaction model before adding more commands.
- Add focused extension tests once a lightweight Pi extension harness is available.
