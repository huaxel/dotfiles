---
name: systematic-debugging
description: Use when a bug, test failure, regression, performance problem, or unexpected behavior needs diagnosis before a fix.
---

# Systematic Debugging

Find the failing boundary and its cause before changing code. Use the lightest
version of this process that fits the problem; do not turn an obvious typo into
a ceremony.

## Workflow

1. **Localize the boundary.** Trace the bad value or event backward through
   the call path — the error site is rarely the source. In multi-component
   systems, inspect what crosses each boundary.
2. **One hypothesis, one experiment.** Write "I think X causes Y because Z."
   Change one variable or add temporary instrumentation. A failed hypothesis
   is information; re-trace.
3. **Lock in the failure.** Keep the smallest regression test or reproduction
   that shows the original symptom. After the root-cause fix, run the focused
   check, then the project's broader checks; report pre-existing failures
   separately.

## Guardrails

- Reproduce or gather evidence (logs, state, timing, config) before proposing
  a fix; never fix based only on a plausible symptom.
- Do not bundle unrelated fixes while the cause is uncertain.
- Replace arbitrary sleeps with condition-based waits when timing is involved:
  poll for the actual condition you care about (`waitFor`), never guess a delay.
- If several hypotheses fail, revisit the system model or architecture rather
  than stacking another patch.
- For an external or environmental cause, document the evidence and add the
  smallest appropriate handling or diagnostic.
