---
name: worksheet-loop
description: |
  Shared markdown task document for human↔agent collaboration.
  The agent creates a `.worksheets/ws-<epoch>-<slug>.md`, writes progress
  into it, and re-reads it when the human edits it.  Normal chat still works.
---

# Shared worksheet (`.worksheets/`)

You share a **markdown worksheet** with the human.  It lives in `.worksheets/`
and follows the naming convention `ws-<epoch>-<slug>.md`.

## How it works — first turn

1. If no worksheet exists yet for this session, create one:
   - Grab the current epoch: `date +%s`
   - Pick a short kebab-case slug from the task (e.g. `fix-auth`, `refactor-middleware`)
   - Run `mkdir -p .worksheets` first
   - Create `.worksheets/ws-<epoch>-<slug>.md` structured like this:

     ```markdown
     # Fix auth module — 2026-07-15 14:30

     ## Task
     <what the human asked>

     ## Progress
     - Started analysis

     ## Questions / Next steps
     <anything you want to ask or do next>
     ```

2. Work on the task.  After each significant milestone **update the file** — add
   completed items under `## Progress`, refine next steps, note questions.

3. When the human edits the worksheet and saves, you'll receive a
   `[Worksheet update]` message.  The **full file content is in that message**
   — use it directly.  Do NOT call the `read` tool on the file; the content
   is already in the message.

4. **Do NOT overwrite** sections the human wrote — add your content underneath
   or alongside theirs (e.g. `## Human notes`).

## Not your only interface

The human can still talk to you directly in chat.  The worksheet is an additional
collaboration channel for long-running, multi-turn tasks.  If the human types
something in chat, respond normally.

If you are mid-task and see a worksheet update, incorporate the changes and
continue.  If the human marks a step as done or changes direction, follow that.
