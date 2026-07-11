# Profiling Tools

Tools agents can use for targeted benchmarking, trying new techniques,
comparing outputs, and comparing profiles.

## Available tools

| Tool | When to use | Project |
|---|---|---|
| `llama-bench` | Model inference speed, speculative decoding | Models (dotfiles has recipes) |
| `autocannon` | HTTP endpoint load testing | Web backends |
| `benchmark.js` | JS function-level benchmarking | Any Node project |
| `playwright trace` | Frontend performance trace | Web frontends |
| `pytest-benchmark` | Python function benchmarking | Python projects |
| `clinic.js` | Node.js flamegraphs + heap profiles | Node backends |
| `perf` (linux) | System-level CPU profiling | Linux servers |
| `py-spy` | Python CPU profiling | Python backends |

## Workflow

### 1. Hypothesis-driven benchmarking

Don't benchmark blindly. Start with a hypothesis:

> "Using `Map` instead of `Object` for player lookups will reduce render time by 30%."

Then:
```bash
just bench player-lookup     # run the specific benchmark
# → implement the change
just bench player-lookup     # compare results
```

### 2. Comparing two approaches

```bash
# Before
git stash
just bench player-lookup > /tmp/before.json

# After
git stash pop
just bench player-lookup > /tmp/after.json

# Compare
diff <(jq '.mean' /tmp/before.json) <(jq '.mean' /tmp/after.json)
```

### 3. Profile-guided optimization

When benchmarks show a hotspot, profile it:

```bash
# Node.js
node --prof src/hotspot.js
node --prof-process isolate-*.log > processed.txt

# Python
py-spy record -o profile.svg -- python src/hotspot.py

# Linux
perf record -g -- python src/hotspot.py
perf report
```

## Adding a new benchmark

1. Create the benchmark script in `scripts/bench/` or `bin/bench-<name>`
2. Add a justfile recipe:
   ```makefile
   bench-player-lookup:
       node bin/bench-player-lookup.js
   ```
3. Document what it measures and the current baseline in the script's comments
