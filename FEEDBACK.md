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
