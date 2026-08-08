# Uncle Bob Gauntlet — Optional Project Quality Workflow

The gauntlet is an opt-in set of mechanical checks for projects that configure
it. It is a project command, not a universal agent requirement or a replacement
for task-specific judgment. Use the project’s documented verification command
and report skipped checks explicitly.

## Philosophy

> I'm not a great programmer; I'm just a good programmer with great habits.
> — Kent Beck

Agents are fast but sloppy. They ship code you'll never read. The only defense
is surrounding them with constraints severe enough that passing code is, by
construction, good enough.

Each configured gate should produce an explicit pass, fail, or skipped result.
A skipped check is visible and requires judgment; it is not silently treated as
proof of quality.

## TDD guidance

For behavior-changing code, prefer a small red-green-refactor loop:

```
RED → GREEN → REFACTOR
test1 → impl1
test2 → impl2
test3 → impl3
```

Write one behavior-focused test, make the smallest implementation pass, then
refactor. Do not batch imagined tests or add speculative code. Docs, config,
exploration, and other non-behavior changes should use proportionate checks
instead of being forced through a full TDD ceremony.

## The Gauntlet Gates

Configured gates run through `just quality`. The runner reports all gates and
exits non-zero when a gate fails; it does not replace project-specific tests or
make skipped checks equivalent to passing checks.

### Gate 1: Lint & Format

```
just quality --gate lint
```

- ESLint/Biome/Ruff with zero warnings (not just zero errors)
- Prettier/format check
- Shell scripts: ShellCheck
- TOML: taplo

**Why first:** Cheap. Catch noise before it wastes downstream gates.

### Gate 2: Complexity Budget

```
just quality --gate complexity
```

Per-module budgets that fail the build:

| Metric | Hard Limit | Why |
|--------|-----------|-----|
| Cyclomatic complexity | 10 per function | Un-testable control flow |
| Cognitive complexity | 15 per function | Human can't reason about it |
| Function length | 24 lines | Fits on one screen |
| Parameter count | 3 per function | Combinatorial test explosion |
| File length | 300 lines | Single responsibility |
| Nesting depth | 3 levels | Early returns > deep nests |

Tools: ESLint complexity rules, Radon (Python), cognitive-complexity-ts.

### Gate 3: Unit Test Coverage

```
just quality --gate coverage
```

| Metric | Threshold | Why |
|--------|----------|-----|
| Line coverage | ≥ 80% | Untested lines are timebombs |
| Branch coverage | ≥ 70% | Every `if`/`else` path exercised |
| Function coverage | ≥ 90% | Dead code is dead weight |

Coverage below threshold → build fails. No exceptions.

Exclude patterns must be committed and reviewed:
```json
// .qualityrc — explicit exclusions only
{
  "coverage": {
    "exclude": ["src/generated/**", "src/types/**"]
  }
}
```

### Gate 4: Mutation Testing

```
just quality --gate mutation
```

Coverage tells you what ran. Mutation tells you whether the tests actually
_care_ about what ran. A mutant is a tiny code change (flip `>` to `<`, replace
`+` with `-`, delete a statement). If no test fails, the mutant **survived** —
your tests don't actually verify that behavior.

| Metric | Threshold | Why |
|--------|----------|-----|
| Mutation score | ≥ 60% | The industry standard for "tests are real" |
| Survived mutants | 0 in critical paths | Auth, payments, data integrity |

Tools: Stryker (JS/TS), mutmut/cosmic-ray (Python).

**First run is slow.** Run mutation on changed modules only (`--incremental`).

### Gate 5: BDD / Gherkin Acceptance

```
just quality --gate bdd
```

Unit tests verify that you built the thing right. BDD verifies that you built
the right thing. Gherkin specs are the contract between agent and acceptance.

```gherkin
Feature: User login
  Scenario: Valid credentials
    Given a registered user "alice@example.com"
    When they log in with password "correct-horse-battery-staple"
    Then they see the dashboard
    And a session token is issued

  Scenario: Invalid password
    Given a registered user "alice@example.com"
    When they log in with password "wrong"
    Then they see "Invalid credentials"
    And no session token is issued
```

Rules:
- Every user-facing feature has ≥ 1 Gherkin scenario
- Every scenario has ≥ 1 automated step definition
- BDD suite must pass (zero failures)
- Scenarios are in `features/` at project root

Tools: Cucumber, Behave (Python), Gauge.

### Gate 6: Code Review

```
just quality --gate review
```

Every change set goes through an independent reviewer subagent. The reviewer:
- Has **read-only** access to the codebase
- Checks for bugs, security issues, and clean code violations
- Produces a structured report with severity levels

Reviewer dispatch:
```markdown
Before claiming completion:
1. Open the read-only `reviewer` subagent
2. Provide changed file paths, requirements, and optionally a readable patch
3. Act on Critical and Important issues
4. Run independent verification after review fixes
```

The reviewer prompt template lives at `skills/requesting-code-review/code-reviewer.md`.
The configured reviewer has file tools only, so commit SHAs alone are not enough.

### Gate 7: Verification

```
just quality --gate verify
```

The final gate — the verification-before-completion pattern. The agent must
run the FULL verification command fresh and confirm output.

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

The agent must:
1. Run the project’s documented quality/verification command
2. Read the full output, including skips and warnings
3. Confirm the exit status and relevant requirements
4. State the result with evidence

No "should pass," "probably fine," "looks good."

## The Quality Score

All gates produce a single score:

```
┌─────────────────────────────────────────┐
│           QUALITY GAUNTLET               │
├─────────────────────────────────────────┤
│  Gate 1: Lint & Format          ✅ PASS  │
│  Gate 2: Complexity Budget      ✅ PASS  │
│  Gate 3: Test Coverage          ✅ PASS  │
│    Lines:    87.3%  (≥ 80%)             │
│    Branches: 74.1%  (≥ 70%)             │
│    Functions: 93.5% (≥ 90%)             │
│  Gate 4: Mutation Testing       ✅ PASS  │
│    Score:    68.2%  (≥ 60%)             │
│    Killed:   156/229 mutants             │
│  Gate 5: BDD Acceptance         ✅ PASS  │
│    Scenarios: 12/12 passing              │
│  Gate 6: Code Review            ✅ PASS  │
│    0 Critical, 0 Important              │
│  Gate 7: Verification           ✅ PASS  │
├─────────────────────────────────────────┤
│  OVERALL: PASS  (7/7 gates)             │
│  Quality Score: 84/100                  │
└─────────────────────────────────────────┘
```

The score is a diagnostic summary, not a universal completion threshold.
The command’s exit status and each gate’s result are authoritative. A skipped
gate must remain visible in the report and is not evidence that the check passed.

## Integration with Agents

### Agent integration

Use the general `worker` for implementation and the read-only `reviewer` for
independent review. Apply the gauntlet when the project configures it and the
change warrants it; do not force TDD or mutation testing onto docs/config work.

### CI Integration

`just quality` runs the configured gates in sequence, records failures and
skips, then exits non-zero if any gate failed. Fix failures and rerun the
relevant checks before claiming completion.

```
just quality          # Run all gates
just quality --watch  # Watch mode for TDD loop
just quality --quick  # Skip mutation (fast feedback for PRs)
```

## Project Adoption

### New Project

```bash
just project-init path=~/projects/my-project mode=standalone
cd ~/projects/my-project
just quality          # Runs the full gauntlet
```

### Existing Project

```bash
just project-init path=~/projects/my-project mode=link
# Add quality dependencies to package.json / requirements.txt
# Configure thresholds in .qualityrc
just quality
```

### .qualityrc

```json
{
  "complexity": {
    "cyclomatic": 10,
    "cognitive": 15,
    "maxFunctionLines": 24,
    "maxParams": 3,
    "maxFileLines": 300,
    "maxNestingDepth": 3
  },
  "coverage": {
    "lines": 80,
    "branches": 70,
    "functions": 90,
    "exclude": ["src/generated/**", "src/types/**"]
  },
  "mutation": {
    "score": 60,
    "incremental": true,
    "exclude": ["test/**", "**/*.test.*", "**/*.spec.*"]
  },
  "bdd": {
    "featuresDir": "features",
    "stepsDir": "features/steps"
  }
}
```

## Reference

- [Test-Driven Development](https://www.amazon.com/Test-Driven-Development-Kent-Beck/dp/0321146530) — Kent Beck
- [Clean Code](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) — Robert C. Martin
- [The Three Laws of TDD](https://www.youtube.com/watch?v=qkblc5WRn-U) — Uncle Bob
- [Mutation Testing](https://stryker-mutator.io/) — Stryker Mutator
- [Cucumber / Gherkin](https://cucumber.io/docs/gherkin/reference/)
- Verification pattern: `docs/patterns/verification-before-completion.md` (via `verification-before-completion` skill)
- Code review pattern: `docs/patterns/requesting-code-review.md` (via `requesting-code-review` skill)
- Test audit pattern: `docs/patterns/test-audit.md`
