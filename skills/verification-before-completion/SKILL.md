---
name: verification-before-completion
description: Use before claiming a change, fix, test, build, or delegated task is complete.
---

# Verification Before Completion

Evidence comes before completion claims. Confidence, a code diff, or another
agent's report is not verification.

## The gate

Before reporting success, state the claim, pick the proof (command, test,
diff, screenshot), run it freshly with the project's real verification command,
inspect the exit status and warnings, then report what passed, what was not
run, and what remains uncertain.

A focused check is enough for a narrowly scoped docs/config change when its
scope is stated. Code changes normally need the project's prescribed lint,
typecheck, test, or CI command. If a command cannot run, report the blocker;
do not convert "not run" into "passed."

## Before handoff or merge

Re-read the requested behavior and check each requirement against the diff.
Inspect `git diff` and `git status` for omissions or unrelated files. List any
pre-existing failures separately from failures introduced here. A review or
another agent's report is not verification — inspect the final diff and run
the relevant checks yourself before reporting completion.
