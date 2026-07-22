# Session Feedback

## 2026-07-20: Resolve Herdr skill collision

### What went well
- Pi package filtering (`"skills": []`) removed the duplicate package skill while preserving the Herdr extension.
- A direct Pi resource-loader check verified one remaining `herdr` skill and no collision diagnostics.

### What was frustrating / slow
- The quota-aware model skill referenced a missing `~/projects/agentq` resolver; the current resolver is in `~/projects/sub-roi-tracker`.

### What config change would have helped
- Keep the quota-aware model skill's resolver path current.

### Improvements for next time
- For Pi resource conflicts, validate filtering through `DefaultPackageManager` and `DefaultResourceLoader` rather than relying only on startup output.

## 2026-07-22: Pi reliability and dynamic footer package

### What went well
- Consolidating the footer into a portable package made its credential, network, and storage boundaries reviewable in one place.
- A second security pass caught and hardened shell credential resolution, redirect handling, response limits, and local storage permissions.

### What was frustrating / slow
- A local `file:` package link does not provide the Pi peer packages to a standalone Node/tsx import, so direct module smoke testing did not mirror Pi's extension loader.
- `npm audit` requires a lockfile even though the package declares no runtime dependencies.

### What config change would have helped
- Add a package-level TypeScript/test script and a documented Pi extension-loader smoke-test command for local packages.

### Improvements for next time
- Add an isolated package test fixture with Pi peer dependencies before publishing a TypeScript extension.
