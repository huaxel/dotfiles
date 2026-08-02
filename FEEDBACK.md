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

## 2026-08-02: npm token leak + broken publish (file: deps)

### What went well
- Push protection caught a real leak (npm auth token committed in tracked `npmrc`); amend + strip fixed it without history rewrite of pushed commits.
- Diagnosed the 403 publish: classic tokens were revoked Dec 2025; granular token needed "Bypass 2FA" (now deprecated for direct publishing ~Jan 2027; 90-day write-token cap). Fixed via browser-driven token creation + gitignored `.npmrc`.
- Caught that `file:` deps publish fine but break consumers; republished with `^0.1.0`, deprecated the broken versions.

### What was frustrating / slow
- Grepping the *current* session jsonl for startup errors matched my own tool calls (self-referential noise) — wasted several rounds. Startup region only, next time.
- Fresh scoped-package 404s on `npm view` right after publish (registry edge lag); publish-time errors were the ground truth. Verify via `curl` packument.
- Driving Zen/Firefox via AX keystrokes was flaky (background drops, duplicated text); AXValue writes on the address bar worked, clipboard copy didn't.

### What config change would have helped
- `~/.npmrc` symlink → tracked `npmrc` was the leak vector; now documented in AGENTS.md (Secrets hygiene) with tokens forced into gitignored `.npmrc`.
- justfile comment claimed npm rejects file: deps — wrong; corrected.

### Improvements for next time
- Never put tokens in the tracked npmrc; keep registry auth in gitignored root `.npmrc`.
- Before any publish, flip file: deps to registry ranges and verify published metadata with `npm view <pkg>@<ver> dependencies`.
- Remember npm's 90-day write-token expiry and the Jan 2027 bypass-2FA cutoff when publishing after ~Oct 30, 2026.

## 2026-08-02 follow-up: item 7 — footer test suite now runs under plain node

- Root cause: package sources use `.js` specifiers everywhere (pi's runtime loader remaps them), but Node type-stripping needs explicit `.ts` specifiers → `ERR_MODULE_NOT_FOUND` under `node --test`.
- Fix: test-only `tests/resolve-hook.mjs` using `registerHooks` retries failed relative `.js` resolutions against `.ts` siblings; `npm test` = `node --import ./tests/resolve-hook.mjs --test tests/*.test.ts`. 12/12 pass; `just ci` green.
- Note: `--test tests/` (trailing-slash dir) fails with ERR_UNSUPPORTED_DIR_IMPORT — use the `*.test.ts` glob (sibling package convention).
- Sibling `opencode-go-usage` already uses `.ts` specifiers + `--experimental-strip-types`; unaffected.
