# Performance Benchmarks

Automated performance tests that detect regression before it ships.
Run these as part of CI or the end-of-shift checklist.

## Frontend benchmarks (Playwright)

For web projects with Playwright, measure page performance metrics:

```typescript
test('home page LCP under threshold', async ({ page }) => {
  await page.goto('#/');
  await page.waitForSelector('main#app');

  const lcp = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        resolve(entries[entries.length - 1]?.renderTime || 0);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
  });

  expect(lcp).toBeLessThan(3000); // 3s threshold
});
```

Register the benchmark test alongside visual regression tests:

```
e2e/tests/benchmarks/
  performance.spec.ts    # LCP, TTI, CLS thresholds
```

## API benchmarks

For backend projects, measure endpoint response times:

```bash
# Sequential requests to warm up
for i in 1 2 3; do
  curl -so /dev/null -w "Request $i: %{time_total}s\n" http://localhost:8787/api/gameweek
done
```

Or use a bench suite like `autocannon` for Node or `hey` for any HTTP:

```bash
# Install: npm install -g autocannon
autocannon -c 10 -d 10 http://localhost:8787/api/gameweek
```

Store results in `data/benchmarks/` and compare against the last run:

```bash
mkdir -p data/benchmarks
autocannon -c 10 -d 10 --json http://localhost:8787/api/players > data/benchmarks/latest.json
```

## CPU / data pipeline benchmarks

For data-heavy projects, benchmark core computation:

```bash
just bench                    # run project-specific benchmarks
just bench-compare            # compare against last run
```

## Comparing results

```bash
# Compare latest vs previous run
diff <(jq '.latency.p50' data/benchmarks/previous.json) \
     <(jq '.latency.p50' data/benchmarks/latest.json)
```

If latency regressed >20%, flag it as a performance regression.

## Thresholds

| Metric | Threshold | Project |
|---|---|---|
| LCP (page load) | < 3s | Web frontend |
| API p50 latency | < 200ms | Backend |
| API p99 latency | < 1000ms | Backend |
| Pipeline runtime | < 30s | Data processing |
| Test suite | < 2x baseline | All |
