---
name: tdd
description: Use when the user requests TDD or a red-green-refactor loop, or when a behavior change benefits from test-first development.
---

# Test-Driven Development

Use tests to specify observable behavior and guide a small vertical slice. Do
not force a full TDD ceremony onto a trivial docs/config edit or a narrowly
scoped exploratory probe.

## Loop

1. **Choose a behavior.** Prioritize the public contract and the highest-risk
   path. Confirm unclear interface or priority decisions with the user.
2. **RED.** Write one focused test through the public interface and confirm it
   fails for the intended reason.
3. **GREEN.** Implement the smallest change that makes that test pass. Avoid
   speculative features.
4. **REFACTOR.** Once green, improve names, duplication, and module boundaries;
   rerun the test after each meaningful step.
5. **Repeat.** Add the next behavior only after the current slice is green.
6. **Finish.** Run the project’s broader verification command and inspect the
   diff.

## Test quality

- Assert behavior, not private implementation details.
- Prefer real public paths and integration-style tests where practical.
- Name tests as capabilities or outcomes.
- Keep fixtures and mocks at the boundary; do not mock the subject under test.
- Add a regression test for a bug when practical, even if the initial fix was
  diagnosed outside a strict red-green loop.

## Avoid

- Writing all tests first and all implementation later (horizontal slicing).
- Testing internal structure that a refactor should be free to change.
- Adding future-facing abstractions before a behavior requires them.
- Refactoring while the test is red.

Pair with `systematic-debugging` when the cause of a failure is unknown and
with `verification-before-completion` before claiming the work passes.
