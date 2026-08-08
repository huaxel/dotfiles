---
name: systematic-debugging
description: Use when a bug, test failure, regression, performance problem, or unexpected behavior needs diagnosis before a fix.
---

# Systematic Debugging

Find the failing boundary and its cause before changing code. Use the lightest
version of this process that fits the problem; do not turn an obvious typo into
a ceremony.

## Workflow

1. **Capture the symptom.** Read the complete error, stack trace, inputs, and
   environment. Record the expected and actual behavior.
2. **Reproduce it.** Find the smallest reliable command or test. If it is not
   reproducible, gather evidence (logs, state, timing, configuration) instead
   of guessing.
3. **Localize the boundary.** Trace the bad value or event backward through the
   call path. In multi-component systems, inspect what crosses each boundary.
4. **State one hypothesis.** Write: “I think X causes Y because Z.” Compare the
   failing path with a nearby working example and recent changes.
5. **Run one minimal experiment.** Change one variable or add temporary
   instrumentation. A failed hypothesis is information; return to step 3.
6. **Lock in the failure.** Add the smallest regression test or reproduction
   that demonstrates the original symptom when practical.
7. **Fix and verify.** Make one root-cause fix, run the focused check, then the
   project’s relevant broader checks. Report failures and pre-existing issues
   separately.

## Guardrails

- Do not propose a fix based only on a plausible symptom.
- Do not bundle unrelated fixes while the cause is uncertain.
- Replace arbitrary sleeps with condition-based waits when timing is involved.
- If several hypotheses fail, revisit the system model or architecture rather
  than stacking another patch.
- For an external or environmental cause, document the evidence and add the
  smallest appropriate handling or diagnostic.

## Supporting notes

Use the companion notes when relevant:

- `root-cause-tracing.md` — backward tracing through callers and inputs
- `condition-based-waiting.md` — synchronization without guessed delays
- `defense-in-depth.md` — validation after the root cause is known

Pair with `tdd` when a new regression test should drive the fix, and with
`verification-before-completion` before reporting success.
