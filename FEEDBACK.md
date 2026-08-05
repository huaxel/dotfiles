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

## 2026-08-02 follow-up: item 6 spike — auto-continue after in-turn account switch

- Session API verified: `pi.sendUserMessage(content, { deliverAs: "followUp" })` (ExtensionAPI) + `agent_settled` event + `ctx.isIdle()` — no deeper session-API surgery needed.
- Critical finding: pi's own auto-retry (on by default, 3 retries, 2s base) re-runs the turn and picks up the switched account via `before_provider_headers`, so extension-level auto-continue is only the last-resort path after that budget is spent — this is what makes it safe.
- Prototype shipped in pi-multi-opencode-go: arm flag on quota/auth switch paths (after_provider_response 429/401/403, message_end quota error), consume at agent_settled with all_exhausted + once-per-run guards, nudge-style prompt (no user-text replay — avoids tool side-effect duplication).
- Verification: strict tsc (npx typescript, module nodenext, allowImportingTsExtensions) clean; module graph loads under node --experimental-strip-types; `just ci` green. Deno absent → `check-ts-packages` skips locally.
- Remaining: live smoke test via `/opencode-autocontinue-test` after a /reload (log line `auto-continue turn=…` in opencode-go-failover.log).

## 2026-08-02 follow-up: item 6 auto-continue — live smoke test VERIFIED

- `/opencode-autocontinue-test` armed at 12:57:11 (turn=0); `agent_settled` queued the retry at 12:59:53 (`auto-continue turn=16: queueing retry prompt`); the prompt landed as a real user turn that woke the agent — full chain works in production (arm → agent_settled → sendUserMessage → new turn).
- Observation: `turnIndex` is session-file-cumulative (survives reload; closure starts at 0) — arming logged turn=0, firing logged turn=16. Cosmetic; logging only.

## 2026-08-02 follow-up: overnight-resume (wait for earliest reset) implemented

- `lib/resume.ts` scheduler (injectable clock/timer) + wiring: armed on quota exhaustion when ALL accounts on cooldown, fires ONE nudge retry at earliest reset + 5s grace, once per cycle; reset on recovery/`/opencode-failover reset`.
- `__opencode_go_earliest_reset` coordination flag published; `/opencode-failover` shows `earliest_reset=… resume=armed|fired`.
- Test seam added: extension factory now takes optional `deps {now,setTimer,clearTimer}`; shared `tests/harness.ts` (fake pi + fetch stub + temp agent dir + fake clock). All test boots inject the fake clock — a real `setTimeout` would keep the node --test process alive forever (caught live: first run hung; "takes forever" was this).
- Flaky-test lesson: fake clock based on `Date.now()` drifts between calls → exact `remainingMs()` assertions failed intermittently; fixed by injectable fixed base for pure unit tests.
- Seam mismatch found: extension computes exhaustion with real `Date.now()` while the scheduler uses injected time — recovery can only be observed via cooldowns clearing (state file/clearCooldowns), not fake-time advance. Documented; keep the scheduler's time source the only fake one.
- Limitation documented: in-process scheduler — no cross-restart persistence (pi must stay open across the cooldown).

## 2026-08-02 follow-up: key dedup + shared fetchDashboardUsage + publish batch

- Dedup (OPENCODE_GO_DEDUP_KEYS, opt-in): dedupeAccounts keeps first occurrence per API key, applied to env + auth.json sources, dropped labels logged; 4 unit tests. Committed d14f74c.
- Shared fetch: opencode-go-usage@0.1.1 adds lib/fetch.ts fetchDashboardUsage (timeout, injectable fetchImpl, auth-expired, never throws). Extension fetch-usage.ts wraps it; footer drops 3 duplicated helpers + UA const (~90 lines removed). Behavior note: footer previously used redirect:"error" (invalid cookie → "fetch failed"); now follows redirects → "auth-expired", matching the extension.
- Published + verified via curl packument (npm view 404 lag): opencode-go-usage@0.1.1, pi-multi-opencode-go@0.1.3 (also carries auto-continue + overnight resume + dedup), pi-dynamic-footer@0.1.6. Tarball check: lib/fetch.ts ships.
- Tooling gap noted: footer + usage packages have no strict-tsc baseline (no tsconfig/@types/node in their dirs; deno gate is syntax-only). Extension stays strict-tsc clean. Adding @types/node devDeps there is optional cleanup, not required for correctness (all runtime suites green).

## 2026-08-02 follow-up: footer all-exhausted display + models catalog tracked

- pi-dynamic-footer@0.1.7: fetchOpencodeGoUsage now reads __opencode_go_all_exhausted + __opencode_go_earliest_reset (extension coordination flags) — when every account is on cooldown it returns provider "opencode-go (all exhausted)" with a full Cooldown window showing the earliest reset countdown (falls back to label-only when earliest is absent). 3 new tests via fetchQuota("opencode-go") with temp-agent-dir auth fixture + fetch stub (15/15 footer suite). Published + verified (0.1.7; registry edge lag showed stale latest for ~8s).
- Committed pi/agent/commandcode-models.json (f4e2334) — benign generated model catalog (355 lines), now tracked.

## 2026-08-02 follow-up: pre-stream retry item — investigated to a definitive disposition

- Traced pi's streaming path end-to-end (sdk.js streamFn → model-runtime prepareRequest → pi-ai openai-responses): `before_provider_headers` (via transformHeaders) fires ONCE per stream call; OpenAI SDK transport retries reuse the prepared headers (stale token after a switch). No per-attempt header hook exists; `before_provider_request` is payload-only.
- Recovery is correct today via pi's agent-level retry (re-runs the stream → fresh headers → switched account) — auto-continue is the last resort. The item is purely a latency optimization, not implementable extension-side, and global `retry.provider.maxRetries` (no per-provider key) makes a mitigation tradeoff not worth it. Closed with evidence; upstream wish recorded in ROADMAP.
- Lesson: don't mark items "blocked on internals" on assumption — 10 minutes of source tracing gave a definitive answer and closed the last roadmap item properly.

## 2026-08-05: footer shows provider + /obs dashboard label

- pi-dynamic-footer: `modelThink` segment now renders `provider/model:level` (e.g. `commandcode/claude-sonnet-4-6:med`) instead of dropping `ctx.model.provider`. Added `provider` to `FooterInput`, dedup so inline provider prefixes aren't doubled, legacy short-code fallback when provider unknown, and a shared `modelLabel()` used by the `/obs` dashboard summary too. 3 new tests; 18/18 green. Committed 46a3530, pushed to origin.
- Deploy path confirmed: repo-local `../packages/pi-dynamic-footer` in `pi/agent/settings.json` — no npm publish needed for local use; next pi session picks it up.
- What was slow: confirming which settings file is live took a few probes (dotfiles `pi/agent/settings.json` vs minimal `~/.pi/agent/settings.json`); the observability history file was the reliable signal that the package loads from the repo path.
- Note: `just ci` still fails on pre-existing local dotfiles drift (npmrc target not a symlink, gitconfig lfs filter drift) — unrelated to this change; `check-ts` warning is pre-existing in herdr-agent-state.ts.

## 2026-08-05 follow-up: provider moved off the status line

- On narrow terminals the `provider/model` prefix made footer line 1 overflow and the context gauge got right-truncated off. Per user direction, provider is now its own toggleable `provider` segment rendered on the accounting line right next to cost (wide line 2 + narrow-fallback line 3); `modelThink` reverted to bare model + thinking level. Committed 6405661. Lesson: when a status line gets crowded, relocate the new info to a less contended line instead of growing the hottest segment.
