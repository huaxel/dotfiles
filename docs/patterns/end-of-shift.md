# End-of-Shift Full Validation

Run before ending any agent session. Leaves the project in a known pristine
state so the next session (or the human) can pick up without surprises.

## Checklist

### 1. Tests pass
```bash
just ci
```
Fix any failures. If a test is flaky, investigate and stabilize it — don't
skip it.

### 2. Visual regression
If the project has visual regression tests:
```bash
just vr
```
If failures are intentional, update baselines: `just update-snapshots`.
Review the new baselines with agent vision to confirm they look right.

### 3. Commit sweep
```bash
git log --oneline -10
```
Scan for the issues in `$HOME/dotfiles/docs/patterns/commit-sweep.md`.
Write findings to `worksheets/sweep-YYYY-MM-DD.md`.

### 4. Agent review
Request a code review for the last batch of changes via
`~/.agents/skills/requesting-code-review/SKILL.md`.

Fix Critical and Important issues. Note Minor issues.

### 5. Worksheet written
```bash
# If there's work in progress:
git tag -a "worksheet-<topic>-$(date +%Y%m%d)" -m "worksheet: <topic>"
```
Verify `worksheets/` has the latest session trace.

### 6. Session feedback written
```bash
# Append to FEEDBACK.md
```

### 7. Working tree clean
```bash
git status --porcelain
```
No untracked files, no uncommitted changes. Everything is committed.

### 8. Worksheet + feedback committed
```bash
git add worksheets/ FEEDBACK.md screenshots/  # as applicable
git commit -m "chore: end-of-shift artifacts"
```

### 9. Pushed (if applicable)
```bash
git push
```

## Flow

```bash
just ci                        # 1. Tests
just vr                        # 2. Visual regression (if applicable)
just commit-sweep              # 3. Sweep recent commits
# request review               # 4. Agent review
# write worksheet              # 5. Session trace
# write FEEDBACK.md            # 6. Session feedback
git status                     # 7. Clean tree
git add -A && git commit -m "chore: end-of-shift YYYY-MM-DD"
git push                       # 9. Push
```
