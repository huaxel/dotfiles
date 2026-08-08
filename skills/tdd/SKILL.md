---
name: tdd
description: Use when the user requests TDD or a red-green-refactor loop, or when a behavior change benefits from test-first development.
---

# Test-Driven Development

Use tests to specify observable behavior and guide a small vertical slice. Do
not force a full TDD ceremony onto a trivial docs/config edit or a narrowly
scoped exploratory probe.

## Loop

1. **RED.** Write one focused test for a single observable behavior through the
   public interface; confirm it fails for the intended reason.
2. **GREEN.** Implement the smallest change that makes it pass; skip
   speculative features.
3. **REFACTOR.** While green, improve names, duplication, and boundaries;
   rerun the test after each meaningful step. Repeat for the next behavior.

## Ground rules

- Do not force the ceremony onto a trivial docs/config edit or a narrowly
  scoped exploratory probe.
- Confirm unclear interface or priority decisions with the user before writing
  the test.
- Assert behavior, not private implementation details; keep fixtures and mocks
  at the boundary.
- Add a regression test for a bug when practical, even if the original fix was
  diagnosed outside a strict red-green loop.
- Finish by running the project's broader verification and inspecting the diff.

Pair with `systematic-debugging` when the cause of a failure is unknown and
with `verification-before-completion` before claiming the work passes.
