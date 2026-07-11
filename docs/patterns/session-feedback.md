# Session Feedback

After every agent session, write a feedback entry so you can periodically
ingest these and improve your workflows. This closes the loop between "what
the agent did" and "how to make the next session better."

## When to write

- At end of every session, after the worksheet is committed
- After a session that felt particularly good or bad
- After hitting a blocker that cost significant time

## Format

Append to `FEEDBACK.md` in the project root (file is git-committed):

```markdown
## 2026-07-12: <topic>

### What went well
- ...

### What was frustrating / slow
- ... (be specific: "getting the model to understand X took 3 retries")

### What config change would have helped
- If AGENTS.md mentioned X, I wouldn't have wasted time on Y
- A justfile recipe for Z would have saved running commands manually

### Improvements for next time
- Short bullet list
```

## How agents use this

The feedback file lives at the project root and accumulates over time.
Periodically (weekly or after a batch of sessions), read `FEEDBACK.md` across
projects, identify patterns, and update workflows accordingly.
