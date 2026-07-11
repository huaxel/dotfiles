# Periodic Commit Sweep

A higher-level review across recent commits, catching things individual
code reviews miss: patterns, regressions, architectural drift, docs that
went stale, tests that got skipped.

## When to run

- After a batch of autonomous night-shift work (e.g. 3–5 backlog items)
- Before a release or deploy to production
- Weekly on `main` if there's steady activity
- After merging a large refactor

## How to run

```bash
# Sweep the last N commits on current branch
git log --oneline -20

# Or sweep since the last tag/release
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

## What to look for

### 1. Commit hygiene
- Are commit messages descriptive and conventional? (`type(scope): description`)
- Are there "fixup!" / "wip" commits that should be squashed?
- Are there large binary files or secrets that shouldn't be committed?

### 2. Doc drift
- Do any commits change behavior without updating docs (PRODUCT.md, DESIGN.md, README.md)?
- Do any commits mention a decision that should be an ADR?
- Are there TODOs or FIXMEs in the code that should be issues?

### 3. Test quality
- Are there commits that add code without tests?
- Are there skipped tests (`test.skip`, `it.skip`) without explanation?
- Are there tests that pass trivially (no assertions, empty bodies)?

### 4. Cross-commit patterns
- Is the same pattern done differently across commits? (inconsistent style)
- Are there repeated code structures that should be extracted?
- Is the same bug fixed in two places instead of one root cause?

### 5. Architecture drift
- Does the change follow the project's stated architecture?
- Are new dependencies introduced without justification?
- Are there layering violations (frontend importing backend code, etc.)?

## Output

Write findings to `worksheets/sweep-YYYY-MM-DD.md`:

```markdown
# Commit Sweep: YYYY-MM-DD

Commits reviewed: abc123..def456

## Issues found
- `abc123` — added new API route without tests
- `def456` — changed scoring logic but didn't update README

## Action items
- [ ] Add tests for new route (abc123)
- [ ] Update README scoring section (def456)

## Clean bill? (yes / no — if no, list what's needed before ship)
```

Then either fix them immediately or create backlog items.
