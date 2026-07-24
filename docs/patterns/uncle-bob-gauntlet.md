# Uncle Bob Gauntlet — Agent Quality Enforcement

The gauntlet is a set of **hard mechanical gates** that agents must pass before
their work is accepted. It is not a skill agents can opt into — it is wired into
the agent definition itself and enforced by CI. You never read agent code; you
run the gauntlet.

## Philosophy

> I'm not a great programmer; I'm just a good programmer with great habits.
> — Kent Beck

Agents are fast but sloppy. They ship code you'll never read. The only defense
is surrounding them with constraints severe enough that passing code is, by
construction, good enough.

Every gate below is a **binary pass/fail**. An amber/soft-guidance gate is not a
gate — it's a suggestion the agent will ignore at the worst possible moment.

## The Iron Law of TDD

This is the non-negotiable foundation. An agent **MUST NOT** write production
code without a failing test first.

```
Production code exists ONLY to make a failing test pass.
Tests exist ONLY to drive the next slice of production code.
```

### Three Laws (Uncle Bob)

| Law | What it means for the agent |
|-----|---------------------------|
| 1. You may not write production code unless it is to make a failing unit test pass. | Every `src/` change must be paired with a `test/` change that came FIRST. |
| 2. You may not write more of a unit test than is sufficient to fail — and compilation failures are failures. | The test must actually fail (red). A test that passes on first run doesn't count. |
| 3. You may not write more production code than is sufficient to pass the one failing unit test. | No speculative code. No "this might be useful later." |

### Vertical Slices Only

Horizontal slicing (all tests first, then all code) is **forbidden**. It produces
crap tests that test imagined behavior, not real behavior. The correct sequence:

```
RED → GREEN → REFACTOR
test1 → impl1
test2 → impl2
test3 → impl3
...
```

One test, one implementation, one refactor. Repeat. Never batch.

## The Gauntlet Gates

Every gate runs on `just quality`. Any failure blocks the agent from claiming
completion. Order matters — each gate builds on the previous one.

### Gate 1: Lint & Format

```
just lint
```

- ESLint/Biome/Ruff with zero warnings (not just zero errors)
- Prettier/format check
- Shell scripts: ShellCheck
- TOML: taplo

**Why first:** Cheap. Catch noise before it wastes downstream gates.

### Gate 2: Complexity Budget

```
just complexity
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
just coverage
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
just mutation
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
just bdd
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
just review
```

Every change set goes through an independent reviewer subagent. The reviewer:
- Has **read-only** access to the codebase
- Checks for bugs, security issues, and clean code violations
- Produces a structured report with severity levels

Reviewer dispatch (from the agent definition):
```markdown
Before claiming completion:
1. Open a reviewer subagent
2. Provide: BASE_SHA, HEAD_SHA, description, requirements
3. Act on Critical and Important issues
4. Reviewer must return "Ready to proceed"
```

The reviewer subagent template lives at `pi/agent/agents/reviewer.md`.

### Gate 7: Verification

```
just verify
```

The final gate — the verification-before-completion pattern. The agent must
run the FULL verification command fresh and confirm output.

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

The agent must:
1. Run `just quality` (all gates)
2. Read the full output
3. Confirm exit code 0
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

The score is a weighted average of gate results, scaled to 0-100. Below 70
is a hard fail. 70-84 is "needs improvement" (agent fixes before claiming).
85+ is "pass."

## Integration with Agents

### Agent Definition (Hard Gate)

The `disciplined-worker` agent definition bakes these constraints into every
prompt. It is NOT a skill — it cannot be unloaded or ignored:

```markdown
You are a disciplined worker. You MUST follow the Uncle Bob gauntlet.

BEFORE writing ANY code:
1. Write a failing test
2. Confirm it fails (red)
3. Write MINIMAL code to pass it
4. Confirm it passes (green)
5. Refactor

BEFORE claiming completion:
1. Run `just quality`
2. ALL 7 gates must pass
3. Quality score must be ≥ 85
4. Reviewer subagent must approve

You MAY NOT:
- Write production code without a failing test
- Write more test than needed to fail
- Write more code than needed to pass
- Batch multiple tests before implementation
- Claim completion without fresh verification
- Skip any gate for any reason
```

### Agent Definition File

Create `pi/agent/agents/disciplined-worker.md` with the full constraints.
Spawn agents using this definition for quality-critical work.

### CI Integration

`just quality` runs every gate in sequence. Fails fast. First failing gate
stops the pipeline — fix that before moving on.

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
