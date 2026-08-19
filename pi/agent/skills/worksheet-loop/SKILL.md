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

1. If no worksheet exists yet for this session, create one.  The easiest way is
   the **`/worksheet start`** command (Tab-completes its subcommands):

   - `/worksheet start fix-auth` — creates `.worksheets/ws-<epoch>-fix-auth.md`
     from the standard template and opens it in a herdr split.
   - `/worksheet start` with no slug — prompts you for a kebab-case slug.
   - `/worksheet attach path/to/document.md` — watches an existing project
     Markdown file and makes it part of the shared loop.
   - Other subcommands: `open` (open latest in a split), `path` (print latest
     path), `status`, `pause`, `resume`.

   Or create one manually:
   - Grab the current epoch: `date +%s`
   - Pick a short kebab-case slug from the task (e.g. `fix-auth`, `refactor-middleware`)
   - Run `mkdir -p .worksheets` first
   - Create `.worksheets/ws-<epoch>-<slug>.md` structured like this:

     ```markdown
     # Fix auth module — 2026-07-15 14:30

     ## Task
     <what the human asked>

     ## Human notes
     <!-- goals, constraints, feedback, or a requested action -->

     ## Todos
     - [ ] Define the next concrete step

     ## Progress
     - Started analysis

     ## Findings
     <durable research or review results>

     ## Decisions
     <durable decisions made during the collaboration>

     ## Questions / Next steps
     <anything you want to ask or do next>
     ```

2. Work on the task.  After each significant milestone **update the file** — add
   completed items under `## Progress`, refine next steps, note questions.

3. When the human edits the worksheet and saves, you'll receive a
   `[Worksheet update]` message that carries the current content. Use it — and
   read the file to confirm it matches if you're mid-task or the message looks
   stale. Trust the message for direction; verify against the file before
   building on it.

4. Treat `## Human notes` as human-owned input. Do NOT overwrite it. Keep
   durable agent state in `## Progress` and `## Findings`, and preserve existing
   entries by appending or adding dated updates. Use `## Questions / Next steps`
   for unresolved decisions and proposed follow-up.

5. Treat a worksheet update as saved human steering input, not as a request to
   merely acknowledge the file. Decide whether it calls for review, research,
   implementation, or clarification, and act accordingly.

6. When the worksheet is the shared source of truth, record durable progress,
   findings, decisions, and next steps back into it so the human can continue
   from the document without reconstructing state from chat.

7. Treat checkbox changes as task-state changes. An unchecked todo is work to
   plan or perform; a checked todo is a completion claim to verify. Treat
   deliberate deletions or replacements as human feedback, not as missing text.

## Not your only interface

The human can still talk to you directly in chat.  The worksheet is an additional
collaboration channel for long-running, multi-turn tasks.  If the human types
something in chat, respond normally.

If you are mid-task and see a worksheet update, incorporate the changes and
continue.  If the human marks a step as done or changes direction, follow that.
