# False-Confidence Test Audit

Tests that pass but don't actually test what they claim create false
confidence. Run this audit periodically to catch them.

## What to look for

### 1. Tests with no assertions
```typescript
test('something loads', async () => {
  await render(<Component />);
  // no expect() calls — passes trivially
});
```

### 2. Tests that never fail
Check test history: if a test has never failed in the last 100 runs,
it might not be testing anything real. Look for:
- Mock that always returns the same value
- Assertion on a static element that never changes
- `expect(true).toBe(true)` or similar tautologies

### 3. Snapshot tests with no meaningful output
```typescript
expect(container.innerHTML).toMatchSnapshot();
// Content is "Loading..." — always passes
```

### 4. Error tests that pass for the wrong reason
```typescript
test('handles error', async () => {
  await expect(async () => {
    await fetchData();
  }).rejects.toThrow('API Error');
});
// If fetchData() never calls the API, it might reject for a
// different reason (e.g. network mock not set up) and pass
// for the wrong reason.
```

### 5. Tests with overly broad mocks
Mocking the entire API layer means the test exercises nothing real.

### 6. Null coverage (lines covered but not validated)
```typescript
test('renders', () => {
  render(<Component />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
  // This line confirms "Hello" is in the DOM
  // It does NOT confirm the component handled its data correctly
});
```

### 7. Visual regression tests that never fail
- `maxDiffPixelRatio` set too high (20%+)
- Screenshot of a page that's always "Loading..." or empty state
- Screenshot with no meaningful content (blank page, skeleton only)

## How to audit

```bash
# 1. Find tests without assertions
grep -r "test(" --include="*.test.*" -A5 | grep -B5 "^\}" | grep -v expect

# 2. Find skipped tests
grep -r "test.skip\|it.skip\|describe.skip" --include="*.test.*"

# 3. Find tests with suspicious mocks
grep -r "jest.fn().mockReturnValue\|vi.fn().mockReturnValue" --include="*.test.*"

# 4. Run coverage
pnpm test -- --coverage --run
# Look for files with high coverage but low meaningful assertions
```

## Output

Write findings to `worksheets/test-audit-YYYY-MM-DD.md`:

```markdown
# Test Audit: YYYY-MM-DD

## False positives found
- `test/auth/login.test.ts:15` — no assertion (component renders but nothing checked)
- `test/api/users.test.ts:42` — mock returns static data, never exercises error path

## Skipped / disabled tests
- `test/features/picks.test.ts` — entire suite skipped, reason: "flaky"

## Action items
- [ ] Add assertions to login test
- [ ] Fix or remove skipped picks tests
- [ ] Lower snapshot diff threshold from 20% to 10%
```
