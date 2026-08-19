# Document Workspace Instructions

This directory is the design and development workspace for the Pi document-first collaboration effort.

## Before acting

1. Read `README.md`, `DESIGN.md`, and `ROADMAP.md`.
2. Read the active worksheet under the project `.worksheets/` directory.
3. Inspect the implementation at `pi/agent/extensions/worksheet-loop.ts` and its skill at `pi/agent/skills/worksheet-loop/SKILL.md` before changing behavior.
4. Check `git status` and preserve unrelated local changes.

## Working rules

- Keep the workflow Markdown-first and editor-agnostic.
- Treat saved revisions as events; do not design around per-keystroke streaming.
- Keep one canonical home for substantive work. Do not duplicate full agent answers in both the TUI and the worksheet without a deliberate document-first mode.
- Preserve human-owned worksheet notes. Append durable agent state rather than rewriting history.
- Record important design decisions in `DECISIONS.md` and update `ROADMAP.md` after milestones.
- Keep `.worksheets/*.md` as runtime project documents; this directory contains design and implementation notes, not the active task documents.

## Verification

Run:

```bash
node --experimental-strip-types --check pi/agent/extensions/worksheet-loop.ts
just ci
just pi-sync-extensions
```

Use a temporary smoke test for watcher behavior when changing event routing, attachment, debouncing, or loop prevention. Deno and ShellCheck may be unavailable locally; report skipped checks.
