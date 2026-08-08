# Uncle Bob Gauntlet — Optional Project Quality Workflow

The gauntlet is an opt-in set of mechanical checks for projects that configure
it. It is a project command, not a universal agent requirement. Use the
project's documented verification command and report skipped checks explicitly.

## Why it exists

Agents are fast but sloppy; the only defense is constraints stiff enough that
passing code is good by construction. Each configured gate produces an explicit
pass, fail, or skip. **A skipped check is visible and requires judgment — it is
not silently treated as proof of quality.**

## TDD guidance

For behavior-changing code, prefer a small red-green-refactor loop: one
behavior-focused test → smallest implementation → refactor. Do not batch
imagined tests or add speculative code. Docs, config, and exploration get
proportionate checks, not a forced TDD ceremony.

## The gates

`just quality` runs each configured gate and exits non-zero when one fails.
Run a single gate with `just quality --gate <name>`; use `--quick` to skip
mutation for fast PR feedback.

| Gate | What it enforces |
|---|---|
| 1. Lint & Format | Zero warnings (ESLint/Biome/Ruff + format) — cheapest filter, run first |
| 2. Complexity | Per-module budgets (e.g. cyclomatic ≤10, <24-line functions, ≤3 params, ≤300-line files) |
| 3. Coverage | Line ≥80%, branch ≥70%, function ≥90% — excludes must be committed and reviewed |
| 4. Mutation | Mutation score ≥60% — coverage shows what ran, mutation shows tests actually care |
| 5. BDD | ≥1 Gherkin scenario per user-facing feature; every scenario automated; suite passes |
| 6. Review | Independent read-only reviewer subagent (see below) |
| 7. Verification | No completion claims without fresh verification evidence |

Thresholds and tools are configured in `.qualityrc` (project root); the
`just quality` runner (`bin/quality-gauntlet`) is the authority for exact
behavior, not this document.

## Reviewer dispatch

Dispatch the configured read-only `reviewer` subagent with changed file paths,
requirements, and optionally a readable patch artifact — commit SHAs alone are
not enough. Fix Critical and Important findings; rerun affected checks after
each fix before claiming completion.

## Verification gate

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Run the project's documented quality/verification command fresh, read the full
output including skips and warnings, confirm the exit status, and report the
result with evidence. No "should pass," "probably fine," "looks good."

## Integration

Use `worker` for implementation and `reviewer` for independent review. Apply
the gauntlet when the project configures it and the change warrants it; do not
force TDD or mutation onto docs/config work. `just quality` runs gates in
sequence, records failures/skips, and exits non-zero on failure.

## Reference

- Kent Beck — *Test-Driven Development*; Robert C. Martin — *Clean Code*;
  [The Three Laws of TDD](https://www.youtube.com/watch?v=qkblc5WRn-U)
- [Stryker Mutator](https://stryker-mutator.io/), [Cucumber / Gherkin](https://cucumber.io/docs/gherkin/reference/)
- Verification pattern: `docs/patterns/verification-before-completion.md`
- Code review pattern: `docs/patterns/requesting-code-review.md`
- Test audit pattern: `docs/patterns/test-audit.md`