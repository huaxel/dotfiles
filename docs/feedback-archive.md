# Session Feedback — Archive

Older session-feedback entries moved here from `FEEDBACK.md` to keep the
active file scannable. The active file retains the most recent month.

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

## 2026-07-26: Subagent UX — teardown & observability

### What went well
- Subagents spawned in parallel, ran independently, delivered results back automatically.
- Scout + worker demo showed the core pattern cleanly.

### What was frustrating / slow
- **Ungracious teardown:** When the user manually closed a completed subagent's pane, the post-completion cleanup tried to close the same pane again, failed with `pane_not_found`, and surfaced that as `Sub-agent "worker-demo" failed (exit code 1)` — making a successful task look like it failed.
- **Poor observability:** After a subagent finishes, the pane shows as "idle" or just sits at a shell prompt. There's no visual cue like "✓ Done — inspect output below" to distinguish a completed subagent from one that's still running or waiting.

### What config change would have helped
- Subagent teardown should gracefully handle already-closed panes (no failure propagation for cleanup-only errors).
- A post-completion state label like `completed` (not just `idle`) on finished subagents would improve UX.

### Improvements for next time
- Make pane cleanup best-effort and silent — don't report it as a subagent failure.
- Add a descriptive banner or state transition so users can tell at a glance: "this subagent is done, its output is here to read."

## 2026-07-30: Starship Git timeout

### What went well
- Measuring Git and Starship separately showed the warning was a transient timeout, not a persistently slow repository.
- Previewing Dotter first prevented unrelated `llama-models.ini` drift from being deployed.
- Full local CI exposed two portability gaps, and focused reproductions identified both root causes before edits.

### What was frustrating / slow
- The one-line prompt fix expanded because `just ci` assumed Mike Farah `yq` syntax and treated intentionally tracked checksum metadata as plaintext secrets.

### What config change would have helped
- Keep CI commands portable across both common `yq` implementations and mirror the checksum allowlist across all secret checks.

### Improvements for next time
- Run `dotter --dry-run` before any deployment and apply a single generated target manually when unrelated templates have drifted.
- Distinguish expected metadata from secret payloads consistently in every hygiene gate.

