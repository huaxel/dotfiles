---
name: verification-before-completion
description: Use before claiming a change, fix, test, build, or delegated task is complete.
---

# Verification Before Completion

Evidence comes before completion claims. Confidence, a code diff, or another
agent’s report is not verification.

## Gate

Before reporting success:

1. **State the claim.** What exactly are you saying is complete or working?
2. **Choose proof.** Identify the command, test, diff, screenshot, or checklist
   that can establish that claim.
3. **Run it freshly.** Use the project’s real verification command, not a partial
   substitute, unless the scope is explicitly narrow.
4. **Inspect the result.** Check the exit status, failure count, warnings that
   matter, and the changed files. Do not infer success from truncated output.
5. **Report accurately.** Say what passed, what was not run, and what remains
   uncertain. Include the command and relevant result.

## Claim → evidence examples

| Claim | Evidence |
|---|---|
| Tests pass | Relevant test command exits 0 with zero failures |
| Build works | Full build command exits 0 |
| Bug is fixed | Original reproduction/regression test now passes |
| Requirements are met | Requirements checklist checked against the diff and tests |
| Agent completed work | Inspect its diff, then run independent verification |
| UI behavior works | Appropriate browser test or captured interaction |

## Scope judgment

A focused check is enough for a narrowly scoped docs/config change when its
scope is stated. Code changes normally need the project’s prescribed lint,
typecheck, test, or CI command. If a command cannot run, report the blocker;
do not convert “not run” into “passed.”

## Before handoff or merge

- Re-read the requested behavior and check each requirement.
- Inspect `git diff` and `git status` for omissions or unrelated files.
- Run the project’s documented gate when feasible.
- List any pre-existing failures separately from failures introduced here.
