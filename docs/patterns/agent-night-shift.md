# Agent Night-Shift Loop

An autonomous loop that drains a project backlog without supervision.
Uses the existing scout → plan → implement → review → commit pipeline.

## Prerequisites

The project must have a backlog file that the loop can read:

| Backlog type | File / command | Status tracking |
|---|---|---|
| Generated backlog | `docs/feature-audit/BACKLOG.md` | Status field (🔴 open / 🟡 blocked / 🟢 done) |
| Simple TODO list | `TODOS.md` | `- [ ]` / `- [x]` checkboxes |
| Task file | `task.md` | Completed tasks get `- [x]` |
| GitHub Issues | `gh issue list --state open --json number,title --limit 5` | Issue open/closed + labels |

## Loop

```
1. Read project AGENTS.md for stack, commands, conventions
2. Read backlog → find first open item
   - If project uses GitHub Issues: `gh issue list --state open --json number,title --limit 5`
   - Otherwise: read the local backlog file (BACKLOG.md / TODOS.md / task.md)
3. If item code has a worksheet for it (worksheets/<code>-*), read it first
4. Scout → Plan → Implement → Request code review → Fix issues
5. Create worksheet: worksheets/<code>-<slug>.md
6. Write session feedback to FEEDBACK.md
7. Mark item done in backlog
   - GitHub Issues: `gh issue close <number>`
   - Local file: update status field or check box
8. Run `just ci` — if it fails, fix and re-run
9. Commit everything (code + worksheet + feedback + backlog update)
10. Tag: `git tag -a "worksheet-<code>-$(date +%Y%m%d)" -m "<code>: <description>"`
11. Push to origin
12. Loop back to step 2
```

## What to do when stuck

- If an item is blocked by a decision you can't make → mark it 🟡 blocked,
  note what's needed in the worksheet, skip to the next item
- If tests fail after implementation → fix them, don't skip
- If `just ci` fails for environmental reasons (missing tool) → note it in
  FEEDBACK.md, skip to next item
