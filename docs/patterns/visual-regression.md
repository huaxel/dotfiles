# Visual Regression Testing

Screenshot-based visual regression for catching unintended UI changes.

## How it works

1. Playwright takes screenshots of key pages with mocked API data
2. Compares against committed baseline PNGs
3. If pixel diff exceeds threshold (10% by default), the test fails
4. Failed test produces a diff image in `test-results/`
5. Agent reviews the diff with vision or manually

## Workflow

### After intentional UI changes

```bash
just update-snapshots   # update all baselines
# or
just update-snapshot "home page"   # update a single test
```

Then visually review the new baselines:
```bash
just review-snapshots   # list new screenshots
# Agent visual review: examine screenshots/visual-regression.spec.ts/<name>.png
```

### When a test fails unexpectedly

1. Check `test-results/` for the diff image (`actual` vs `expected` vs `diff`)
2. If it's a real regression, fix the code
3. If the test is flaky (animations, timing), add `waitForTimeout` or disable animations
4. If the test is brittle (data-dependent), improve the API mocks

## Writing visual regression tests

Key patterns:
- **Always mock API data** — real data varies and breaks baselines
- **Prevent service workers** — SW intercepts fetch, breaking `page.route()`
- **Wait for animations** — `waitForTimeout(1000)` after navigation
- **Test both themes** — light and dark mode
- **Test mobile viewport** — `page.setViewportSize({ width: 375, height: 667 })`

```typescript
test('my page', async ({ page }) => {
  await preventServiceWorker(page);
  await setupMockEnvironment(page, 'logged-out');
  await page.goto('#/my-page');
  await page.waitForSelector('main#app', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await expect(page).toHaveScreenshot('my-page.png');
});
```

## Project structure

```
screenshots/                  # committed baseline PNGs
  visual-regression.spec.ts/  # grouped by test file
    home-logged-out.png
    ranking-logged-out.png
    ...
test-results/                 # gitignored — diff outputs on failure
  .last-run.json
  visual-regression-...
playwright-report/            # gitignored — HTML report
```

## Configuration

In `playwright.config.ts`:
- `snapshotDir: './screenshots'` — where baselines live
- `snapshotPathTemplate` — organizes by test file name
- `maxDiffPixelRatio: 0.1` — 10% pixel diff allowed
- `maxDiffPixels: 100` — max individual pixel diffs
