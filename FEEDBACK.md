# Session Feedback

## 2026-08-28: `/go-on mode` activation

### What went well
- Reused the existing burst activation path so `/go-on mode` now sends the initial nudge and arms auto mode.
- Added behavioral coverage for activation, repeat use, and rejecting plain `/go-on` usage.
- `just ci` passed.

### What was frustrating / slow
- The first repeat-command test needed to simulate Pi's `agent_start` event because the existing pending-nudge guard intentionally prevents overlapping idle sends.

### What config change would have helped
- No additional configuration was needed.

### Improvements for next time
- Include lifecycle-event simulation whenever testing repeated extension commands that use asynchronous Pi dispatch.

## 2026-08-25: qBittorrent/Sonarr shared media path

### What went well
- The live container mounts and qBittorrent category paths identified the mismatch quickly.
- Recreating only the four affected containers restored `/data/media/series` without touching bind-mounted data.
- `just ci` passed and the fix was committed and pushed.

### What was frustrating / slow
- The remote host uses fish as its SSH command shell, so Bash-style loops and assignments failed until commands were wrapped with `bash -lc`.
- Fixed `container_name` values caused Compose to report a name conflict instead of recreating stale containers.

### What config change would have helped
- A deployment command that safely recreates fixed-name Compose services would avoid manual container removal.
- Keeping the deployed compose file synchronized with the tracked reconstruction would reduce source drift.

### Improvements for next time
- Wrap multi-step remote commands in `bash -lc` immediately on fish-based hosts.
- Verify all category path destinations across qBittorrent, Sonarr, Radarr, and Whisparr together.

## 2026-08-25: Dotter fresh-clone deploy failure

### What went well
- Reproduced the exact missing-source error and isolated both the absent ignored `.npmrc` and stale ignored binary mappings.
- Made bootstrap create a mode-600 empty npm source without exposing or overwriting credentials.
- `just ci` passed and the original `expand file` error no longer appears.

### What was frustrating / slow
- Historical Dotter fixes left explicit mappings for machine-local binary paths that are intentionally absent from fresh clones.

### What config change would have helped
- Optional ignored sources need bootstrap initialization or conditional mappings; mandatory mappings to ignored files are fragile.

### Improvements for next time
- Test deployment from a clean clone or missing-local-source state after adding Dotter mappings.

## 2026-08-24: Dotter binary symlink warnings

### What went well
- Reproduced the deployment output and confirmed the binary targets were already valid symlinks.
- Explicit symlink mappings removed both UTF-8 detection warnings without overwriting local configuration.
- `just ci` passed, with only the repository's existing non-blocking TypeScript lint warnings.

### What was frustrating / slow
- Dotter reports intentional local divergence as errors even though the repository gate already classifies these targets as protected.

### What config change would have helped
- A first-class Dotter ignore/protected-target setting would avoid noisy errors for machine-local files.

### Improvements for next time
- Explain protected-target behavior before considering `--force`.
- Keep binary files under broad directory mappings explicitly typed as symlinks.

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

## 2026-08-05 follow-up: narrow-screen priority dropping

- Mobile/narrow terminals right-truncated footer line 1, chopping the context gauge (last segment) first. Rewrote defaultAssembler with rank-based dropping: status line drops turn counter then TPS; accounting line drops runtime/pwd/tokens/cache; model, gauge, git, cost and provider always survive, with the model shrunk as last resort so the gauge never disappears. Old 3-line fallback superseded — footer stays 2 lines + bars on small screens. Committed e203c76; 20/20 tests. Lesson: when adding segments, the assembler must degrade by priority, not position.

## 2026-08-09: /restart extension bug fixes + no-confirm restart

### What went well
- Three-scoped batch (32b0662, 27c191a, 5316e61) stayed strictly bug-fixes: no new features beyond the user-requested no-confirm restart. `just ci` fully green.
- Root cause for "restart during streaming kills the turn": extension commands execute immediately even mid-stream, and the old `ctx.abort(); await ctx.waitForIdle()` discarded uncommitted turn content before the handoff could capture it. Replaced with `if (!ctx.isIdle()) await ctx.waitForIdle()` — a one-line semantic fix with a clear comment.
- Per-session guard state (`guardOpen` boolean → `Set<string>` cleaned on shutdown) fixed a real cross-session mute bug: a guard prompt in one session was suppressing the guard everywhere.
- Hand-rolled AbortController+setTimeout → native `{ timeout }` removed a whole class of timer/cleanup code; native timeout shows the countdown.
- Runtime-settings mystery fully resolved: `~/.pi/agent/settings.json` (166 B, Jul 13) is a STALE leftover — pi reads settings from `PI_CODING_AGENT_DIR` (dotfiles tree) per `dist/config.js` getSettingsPath(). The `from-dotfiles` dir under ~/.pi sessions is a tokscale bind mount (fstab-persisted), not a second live store. No sync mechanism exists because none is needed.

### What was frustrating / slow
- The reviewer subagent died (exit 1) mid-review on an unhandled exception, with no report. Resumed the session rather than re-spawning.
- Confirming "which settings file is live" took several probes (stale ~/.pi file looked authoritative until tracing pi's dist code). Mirrors the 2026-08-05 note about the same ambiguity.
- `deno check` on the extension shows 19 pre-existing errors (pi-internal packages unresolved standalone) — the gate's syntax-fallback path is doing real work; one has to know why.

### What config change would have helped
- A justfile recipe that prints the RESOLVED pi config dir (agent dir, settings path, session dir) would have collapsed the settings-ambiguity probe to one command.

### Improvements for next time
- For any future "which of these two dotfiles paths is live" question: read pi's `dist/config.js` getAgentDir()/getSettingsPath() FIRST — it definitively settles it.
- When the reviewer agent dies without output, resume its session with the same task before re-dispatching.
- No running pi session has reloaded yet — new /restart behavior activates after `/reload` (or restart); remember to note that for the user in the final report.
- Follow-up note: the `reviewer` subagent failed twice (original + resume) with exit 1 — resumed sessions also crashed. Diagnosed: the failure is in the subagent harness/reader step, not the review content (it had read the patch and diffed files before dying). Did a rigorous self-review instead; recorded 2 Minor findings (whitespace handoff guard, no wait feedback). For small isolated batches, self-review + documented Minors is acceptable per the requesting-code-review skill; re-try the reviewer for larger batches.

## 2026-08-11: go-on keybindings — the reserved-key trap + terminal-level keys

### What went well
- Root-causing "Alt+Shift+Enter does nothing" was fast once I replicated pi's REAL `getShortcuts()` conflict logic against the installed defaults instead of trusting the behavioral harness: the harness records every `registerShortcut` call, so the skipped `alt+enter` registration (reserved by `app.message.followUp`) looked live. A 30-line replica of `buildBuiltinKeybindings` + the RESERVED list from `dist/core/extensions/runner.js` proved the skip with hard output.
- The user's veto (`alt+enter` = GNOME Terminal new window / Windows Terminal fullscreen) collapsed the design space immediately: legacy ESC CR can only be claimed via the `alt+enter` key id, so the fallback had to move to a different chord entirely. `ctrl+alt+g` (ESC BEL) was already proven to reach pi from the earlier `matchesKey` probe.
- Verified both protocol modes against pi-tui's parser with the mod+1 kitty encoding (`\x1b[13;4u` etc.) — caught my own off-by-one in the test sequences before reporting.
- 2285e89 extended the behavioral tests with a regression assertion that `alt+enter` is NOT claimed, plus legacy-burst behavior (arm + nudge + disarm-on-second-press).

### What was frustrating / slow
- The kitty CSI-u modifier field is `bitmask+1`, and pi-tui subtracts 1 internally — my first verification run used the raw bitmask and produced a confusing all-false table. Cost one extra probe of `parseKittySequence`.
- The session transcript showed the previous agent had ALREADY concluded "your terminal is not reporting Kitty modifier sequences" but never checked whether the fallback key it picked would actually register — the reserved-key filter is invisible to `matchesKey`-level tests.

### What config change would have helped
- Nothing config-level; but a tiny committed test that asserts "every registered shortcut survives pi's reserved-key filter" (importing the RESERVED list or replicating it) would have caught 0fad716 at review time.

### Improvements for next time
- When testing keybindings: (1) replicate the runner's reserved-key filter, (2) test the actual byte sequence through `matchesKey` in BOTH `setKittyProtocolActive(true|false)` modes, (3) ask whether the terminal emulator binds the key itself.
- Commit the behavioral tests into the repo (`pi/agent/extensions/go-on.test.mjs`) instead of leaving them in /tmp.

## 2026-08-12: Consolidate Pi instructions

### What went well
- Moved the Pi-specific overlay rules into the shared `AGENTS.md` contract and replaced the stale subagent README reference with dedicated Herdr skill links.
- `just ci` passed, including Git hygiene and secret checks.

### What was frustrating / slow
- The documented `requesting-code-review` skill path is absent from `$HOME/.agents/skills/`, so the required independent-review step could not be followed.

### What config change would have helped
- Keep every skill path referenced by `AGENTS.md` installed or update the contract when skills move.

### Improvements for next time
- Treat missing required skills as a verification exception and record the exact path in session feedback.

## 2026-08-12: OpenCode Go official usage API migration

### What went well
- Tweet (@vimtor, 2026-08-11) announced `GET https://opencode.ai/zen/go/v1/usage`; probed the endpoint and confirmed live (401 without key, JSON with real key). Response shape: `{usage:{rolling|weekly|monthly:{status,percent,resetsAt}}}`.
- Verified per-account live: sub-1 = 15/42/82%, sub-2 = 0/0/100% — API works with the same keys used for chat completions.
- Migrated all three packages to API-first: `opencode-go-usage@0.2.0` (new `fetchUsageApi`/`parseUsageApiJson`), `pi-multi-opencode-go@0.2.0` (fetch via API, `workspaceId`/`authCookie` now optional legacy fields), `pi-dynamic-footer@0.1.8` (quota-provider API-first with dashboard fallback for keyless configs).
- Test harness fix: `makeFakePi` lacked a `registerTool` stub, which had broken 8 of 16 extension tests on the clean tree; now 16/16 pass.
- All gates green: 15 + 16 + 33 tests, `just ci` passes. Committed as d2fe717.

### What was frustrating / slow
- `formatResetTime` test is a pre-existing time-boundary flake (a minute-boundary crossing flips `now + 90min` to `1h31m`); passes on rerun, unrelated to this change.
- `pi/agent/settings.json` has an unrelated pre-existing edit (`defaultThinkingLevel: max→high`) left untouched.

### What config change would have helped
- None this session.

### Improvements for next time
- Run the full test suites twice when touching time-dependent code to catch boundary flakes before attributing them.

## 2026-08-13: nvim rescue + hardening

Long session: user's nvim was 73s to start. Root cause was Mason state
corruption (36/39 package dirs wiped Apr–Jun → mass GitHub re-downloads on
every open). Fixed, then hardened the whole setup.

### What went well

- Root-caused the startup stall: Mason broken symlinks → re-download storm.
  Headless Mason reinstall (waiting on `InstallHandle:is_closed()`) fixed all
  36 packages; startup 73s → 95ms.
- pi as CodeCompanion chat adapter via pi-acp (ACP bridge) — verified
  end-to-end handshake; no external model service needed.
- Fixed a real LazyVim v16 regression the user's config was hitting (Snacks
  lazy-load override → `Snacks.keymap.set` nil on every file open).
- Pinned LazyVim to stable instead of tracking main, disabled the background
  updater — matches the user's "own the config" preference.
- neotest verified end-to-end (4 adapters, pytest process proven) after
  fighting the state API for several probes.
- Gate `just ci` fixed properly: SSH_OPTS array (SC2086), grouped redirects
  (SC2129), dotter tolerance for llama-models.ini local divergence.

### What was frustrating / slow

- neotest headless verification burned ~6 probe runs. The state API is
  confusing: `state.adapter_ids()` populates only after `run.run()`,
  results are per-adapter via the client (`state:results(adapter_id)` is NOT
  on the consumer; the tracker calls `client:get_results`). Headless async
  job output parsing added noise. In hindsight: verify adapter registration
  (config.adapters) + check for a live pytest process instead of chasing
  result accessors.
- Chased "render-markdown.nvim never installed" for a while — user's own
  `markdown.lua` (markview) explicitly disables it. Lesson: check the user's
  plugin files BEFORE digging into LazyVim internals.
- Suggested extras without reading `lazyvim.json` first — docker/yaml/
  typescript were already enabled. Cheap miss, wasted a suggestion round.

### What config change would have helped

- AGENTS.md or a repo note: "extras suggestions must diff against
  config/nvim/lazyvim.json first".
- A justfile recipe for the headless neotest probe would have saved
  re-typing the verify script.

### Improvements for next time

- Probe order for neotest: config.adapters → adapter.root/is_test_file →
  live process check; only then results.
- Always grep the user's config dir before diagnosing "missing" plugins.
- Sweep `lazyvim.json` extras list before proposing extras.

## 2026-08-16: Commit and push configuration and learning updates

### What went well
- `just ci` passed all blocking checks.
- Generated fff databases were identified as machine-local runtime state and excluded from version control.

### What was frustrating / slow
- None.

### What config change would have helped
- A pre-existing ignore rule for `pi/agent/fff/` would have avoided classifying its runtime databases during commit preparation.

### Improvements for next time
- Keep generated agent indexes excluded from the start.

## 2026-08-17: Resolve settings merge conflict

### What went well
- JSON validation and `just ci` confirmed the merged settings are valid.
- The upstream model list was preserved while retaining the stashed runtime configuration.

### What was frustrating / slow
- Git's clean filter initially obscured status output because the conflicted file was invalid JSON.

### What config change would have helped
- A conflict-aware validation step for JSON settings could report the conflict more directly.

### Improvements for next time
- Inspect stage 2 and stage 3 blobs before resolving generated/config files.

## 2026-08-19: Windows Pi secret sync

### What went well
- Mirroring `env.fish` into PowerShell made Pi/Openference use the same encrypted secret source without a manual login step.
- The default-path fallback for `~/.pi/agent/auth.json` fixed the provider that hardcodes its own lookup.

### What was frustrating / slow
- Dotter on Windows was confusing: running from `.dotter/` breaks config lookup, and the repo root still needs `.dotter/local.toml` before deploy works.
- `just ci` surfaced pre-existing dotter target collisions, so the repo-level gate was noisy even though the secret-sync code itself was fine.

### What config change would have helped
- A documented Windows deploy recipe that always creates `.dotter/local.toml` before `dotter deploy` would have removed one round of confusion.
- It would help to note which Pi providers read `auth.json` from a hardcoded default path versus `PI_CODING_AGENT_DIR`.

### Improvements for next time
- Keep the env-to-auth mirror in the shared secret loader, not as a manual repair step.
- When a provider ignores the custom Pi dir, patch the loader once and mirror to the compatibility path automatically.

## 2026-08-19: Document-first worksheet loop

### What went well
- The existing worksheet watcher provided a strong transport layer for a document-first interaction model.
- Semantic line summaries make human additions, replacements, and deletions visible to Pi.
- Explicit attachment lets an existing project Markdown file participate without requiring an Obsidian or Neovim integration.
- Pause/resume and smoke tests covered the main watcher lifecycle paths.

### What was frustrating / slow
- Deno and the independent review skill were unavailable locally, so validation used Node type-stripping, smoke tests, and the repository gate.

### What config change would have helped
- A lightweight committed Pi extension harness would make watcher regression tests easier to maintain.

### Improvements for next time
- Add focused tests for document diffs, ownership boundaries, comments, and todo transitions.
- Keep the terminal transcript as an execution log while moving durable collaboration state into the document.

## 2026-08-21: AltGr grave accent conflict

### What went well
- Comparing the working AltGr mappings with the broken R mapping isolated the issue to GlazeWM's `ralt+` and `ctrl+ralt+` bindings.
- Removing those bindings preserved left-Alt window-manager shortcuts while freeing Right Alt for AutoHotkey.

### What was frustrating / slow
- The initial diagnosis focused too long on Colemak scan-code and InputHook behavior before checking the window-manager configuration.

### What config change would have helped
- Document that Right Alt/AltGr is reserved for the AutoHotkey multilingual layer and must not be registered by GlazeWM.

### Improvements for next time
- Cross-check global hotkey consumers early when one scan-code mapping fails while neighboring mappings work.

## 2026-08-23: agy delegate safety and reliability

### What went well
- The package already had focused tests and a clear CLI boundary, making safety fixes small and verifiable.
- The full repository gate passed after adding sandbox, stream, JSON, command, and lock regressions.

### What was frustrating / slow
- The independent agy review terminated before producing findings, so the final review had to be manual.

### What config change would have helped
- Keep the requesting-code-review skill available at its documented path, or provide a repository-local fallback.

### Improvements for next time
- Add a subprocess harness for deterministic agy stdout/stderr and abort behavior rather than relying only on pure helpers.

## 2026-08-23: /restart model-registry hardening

### What went well
- Comparing the extension with Pi’s official handoff example exposed the auth gap quickly.
- Switching to `ctx.modelRegistry.complete()` preserves OAuth and custom-provider support while keeping cancellation wired to the loader.
- Full `just ci` passed; restart type-check and lint passed independently.

### What was frustrating / slow
- The documented independent review skill is missing, and two read-only agy review attempts exited without returning their report.

### What config change would have helped
- Install or replace `requesting-code-review/SKILL.md` so the required review gate is executable.

### Improvements for next time
- Add a small extension harness for testing loader cancellation, provider failures, and session replacement without a live TUI.

## 2026-08-24: Dotter protected-target reconciliation

### What went well
- Preserved npm settings by moving them to the gitignored root `.npmrc` and keeping `~/.npmrc` as a symlink.
- Synced intentional Linux llama.cpp and Git LFS changes into their templates without force-overwriting targets.
- Dotter dry-run is now clean.

### What was frustrating / slow
- Dotter cache briefly reported the old npm source and new ignored source as remove/add operations during migration.

### Improvements for next time
- Move credential-bearing local sources to the ignored root before changing Dotter mappings.
- Re-render template targets and compare whitespace before applying updates.

## 2026-08-24: Pi theme hierarchy polish

### What went well
- The Ghostty sync generator already had a strong Tokyo Night palette and contrast work, so the improvement stayed focused on hierarchy.
- The checked-in generated theme was updated alongside the generator and README.
- JSON validation and the full repository gate passed.

### What was frustrating / slow
- Direct TypeScript smoke testing was blocked by the local Pi package's peer-loader setup; the repository gate also skips Deno because it is not installed.

### What config change would have helped
- A documented local Pi extension-loader smoke-test command would make generator checks reproducible outside Pi.

### Improvements for next time
- Add package-level tests for generated token coverage and palette-to-theme reproducibility.

## 2026-08-24: Pi theme contrast follow-up

### What went well
- A quick contrast audit caught muted tool output falling below readable contrast on tinted surfaces.
- The fix preserved hierarchy with a blended secondary color instead of making all tool output full-bright.

### What was frustrating / slow
- The repository gate still cannot type-check package TypeScript without Deno installed.

### Config change that would have helped
- Include Deno in the standard dotfiles validation environment.

### Improvements for next time
- Add a pure theme-generator module so contrast and token tests can run without Pi's runtime loader.

## 2026-08-24: Pi theme generator testability

### What went well
- Extracting `theme.ts` removed the Pi peer dependency from parsing and generation tests.
- Three focused Node tests now cover parsing, normalization, token completeness, and hierarchy.
- `npm pack --dry-run` confirmed tests stay out of the published package.

### What was frustrating / slow
- The first package test command was run from the repository root and had to be rerun from the package directory.

### Config change that would have helped
- A root recipe for package-local tests would make the intended working directory obvious.

### Improvements for next time
- Add a `just pi-package-test <package>` helper if more local packages gain focused tests.

## 2026-08-24: Pi theme adaptive semantic contrast

### What went well
- WCAG contrast checks exposed a generalization gap: ANSI colors that look fine in Tokyo Night can disappear in light themes.
- The binary-search adjustment preserves the original hue when possible and leaves the active Tokyo Night snapshot unchanged.
- Four focused tests and a live Ghostty snapshot comparison passed.

### What was frustrating / slow
- None significant; the pure module made this pass straightforward.

### Config change that would have helped
- A shared color-contrast utility could avoid repeating small ad hoc audit scripts.

### Improvements for next time
- Add contrast assertions for tinted surfaces, not only the base background.

## 2026-08-24: Pi 0.84.3 update validation

### What went well
- Confirmed the updated global Pi version and verified the custom theme against the installed 0.84.3 schema and built-in themes.
- Theme tests and the active Ghostty snapshot comparison remained green.
- Audit dry-run showed no non-breaking fixes, avoiding an unsafe forced upgrade.

### What was frustrating / slow
- The generated extension cache still contains older peer-installed Pi 0.80.3 artifacts even though the global CLI is 0.84.3, which makes `npm ls` noisy.

### Config change that would have helped
- A documented distinction between the global Pi CLI and the generated `pi/agent/npm` extension cache would clarify update diagnostics.

### Improvements for next time
- Add a read-only health check that reports global Pi, extension-cache Pi, and peer-range mismatches together.

## 2026-08-24: Pi prompt background visibility

### What went well
- Tracing Pi's `userMessageBg` usage showed the prompt surface was present but only 1.1:1 apart from the terminal background.
- A small foreground blend made sent prompts visibly distinct while preserving the Tokyo Night palette.
- The active generated snapshot and regression tests caught the intended value.

### What was frustrating / slow
- Pi uses “user message” for sent transcript prompts; its live input editor is a separate component and has no theme background token.

### Config change that would have helped
- A first-class `editorBg` theme token would avoid needing a custom editor wrapper for the live input area.

### Improvements for next time
- Distinguish transcript prompt surfaces from the live prompt editor when discussing theme changes.

## 2026-08-24: Pi live editor background

### What went well
- Pi 0.84.3's documented `CustomEditor` API provided a narrow render-only wrapper that preserves inherited keybindings and autocomplete wiring.
- Reusing `userMessageBg` and `borderAccent` avoided inventing an unsupported theme token and kept the editor synchronized with Ghostty.
- The wrapper leaves an existing custom editor untouched, and focused tests cover the palette tokens and ANSI reset restoration.

### What was frustrating / slow
- `npm test` must run from the package directory; the root npm project has no test script.
- The repository gate cannot run Deno or ShellCheck locally because those tools are not installed.

### Config change that would have helped
- A root recipe for package-local tests would make the intended working directory explicit.

### Improvements for next time
- Keep custom editor decoration render-only so Pi owns input, autocomplete, and app-action behavior.
- Recheck package `files` whenever adding a runtime module imported by an extension entry point.

### Follow-up validation
- A real PTY launch confirmed live text rendering with the `#2e303f` background and accent border.
- Typing `/` triggered Pi's autocomplete UI while the editor decoration remained active; no repository changes were left by the smoke tests.

### Follow-up correction
- The user clarified that only sent chat messages should have the stronger surface; the live prompt zone should remain unchanged. Reverted the custom editor wrapper and retained the `userMessageBg` transcript styling.

## 2026-08-25: Consolidate Docker media runtime

### What went well
- Auditing mounts exposed that Kubernetes and Docker were concurrently opening the same media SQLite configs.
- Scaling the duplicate Kubernetes Deployments to zero and using fixed EndpointSlices preserved the existing NPM hostnames without data deletion.
- Pinning Docker network addresses makes the proxy endpoints stable across container recreation.

### What was frustrating / slow
- The active Docker project was the aggregate `~/docker` project, not the individual media-stack compose directory; invoking the subproject directly caused a harmless container-name conflict.
- The repository’s requested requesting-code-review skill was unavailable at its documented path.

### What config change would have helped
- A documented compose-project ownership rule would prevent running an included compose file directly.
- A first-class helper for Docker-backed selectorless Kubernetes Services would avoid manual EndpointSlice maintenance.

### Improvements for next time
- Audit compose labels and project ownership before recreating containers.
- Prefer stable host-port or fixed-IP proxy targets when Kubernetes and Docker share a node.

## 2026-08-25: liedelpi service hardening

### What went well
- Direct SSH to liedelpi from framearch worked seamlessly
- SQLite manipulation for NPM proxy host insertion was reliable
- NPM API discovery (version 2.13.6) was fast
- The dual-runtime discovery was caught early and documented

### What was frustrating / slow
- Fish shell on liedelpi doesn't support bash-style loops (`for var in list; do` requires `for var in list; in`) — had to write scripts to /tmp and `bash /tmp/script.sh`
- Portainer CE's 307 redirect behavior was unexpected — cost 15 min to diagnose (NPM proxy returned "Congratulations!" default page because the generated nginx conf pointed at Docker container which 307s on Host mismatch)
- The `immich.conf` nginx file was already regenerated by a previous writer (pointing to k3s ClusterIP `immich-server.immich.svc.cluster.local:2283`) — hadn't noticed that the Docker immich was a phantom duplicate

### What config change would have helped
- A `just liedelpi-hardening` recipe in the dotfiles justfile would have saved manual SSH + multi-step commands
- The NPM proxy config generation process isn't well-documented in the runbook — had to reverse-engineer from the SQLite schema

### Improvements for next time
- Add NPM proxy host documentation to infrastructure-runbook.md (how to add/edit via SQLite)
- Consider adding a `liedelpi` alias or helper script for common SSH operations
- The dual-runtime pattern (Docker + k3s for same service) should be called out earlier in the runbook — cost significant investigation time

## 2026-08-27: Openference usage quota in Pi footer

### What went well
- The authenticated `GET /v1/usage` response supplied enough evidence to add Openference quota bars without exposing the API key.
- Shared parsing and provider wiring kept the feature reusable across the usage library and dynamic footer.
- Targeted tests, typechecks, and `just ci` passed.

### What was frustrating / slow
- Openference’s usage endpoint is not documented in its public API catalog, so the successful response schema could not be confirmed from docs; the parser intentionally accepts nested and flat quota shapes.
- The documented independent review skill is missing at `/home/juan/.agents/skills/requesting-code-review/SKILL.md`.

### What config change would have helped
- A package-local test recipe at the repository root would avoid the initial root `npm test` miss.
- Openference should document `/v1/usage` and its successful response schema.

### Improvements for next time
- Capture one successful post-reset `/v1/usage` payload and add it as a fixture if Openference changes the response shape.
- Keep provider-specific quota fetchers in the shared usage package so footer consumers stay thin.

## 2026-08-27 follow-up: Openference usage endpoint was wrong — corrected to /api/user/me

### What went well
- A post-reset `curl /v1/usage` with a valid key + available quota returned 404, exposing that the earlier 401/402 were auth+quota middleware short-circuiting before routing, NOT proof the route existed. The feature had shipped against a non-existent endpoint.
- Inspecting the Openference dashboard JS bundle (single `index-*.js`) surfaced the real web API on `openference.com`: `GET /api/user/me` authenticates with the inference API key via Bearer and returns `usage`/`plan`/`limits`. The dashboard's `tst()` helper revealed the bar uses cost-weighted `windowQuotaUsed`/`weekQuotaUsed` against `plan.requestsPerWindow`/`requestsPerWeek`, with epoch-ms resets — so the parser now mirrors the UI exactly.
- Rewrote the parser, tests (8+3), both READMEs; 30/30 + 47/47 tests, tsc clean, `just ci` green, and verified live against the real key (5h 7.25%, Week 50.3%). Committed 7139a1b, pushed.

### What was frustrating / slow
- The original probe methodology (invalid key → 401, exhausted key → 402) could not distinguish "route exists" from "middleware rejected before routing". A 402 from a quota limiter is indistinguishable from a 200-capable route when the key is exhausted. This was the core mistake and it shipped a broken fetcher.
- Openference documents usage as "dashboard-only"; the dashboard's web API (`/api/user/*`) is undocumented. Discovering it required reading the minified bundle. `/api/user/billing/overview` needs a web session cookie (403 with just the key), but `/api/user/me` carries the full quota picture with key-only auth.

### What config change would have helped
- When probing for an endpoint's existence, use a VALID key with available quota; only a 200/4xx-from-routing (not middleware 401/402) proves the route exists.
- Openference should expose a documented usage API; the inference key already authenticates `/api/user/me`.

### Improvements for next time
- Never infer "route exists" from a 401/402 returned under auth/quota failure — those fire before routing. Confirm with a fully-valid request first.
- When a provider says usage is "dashboard-only", read the dashboard's JS bundle to find the real (often undocumented) web API and its auth model before building.
- Mirror the dashboard's exact field precedence for quota bars (`windowQuotaUsed` over `windowRequests`) so the footer matches what the user sees in the UI.
## 2026-08-28: Commit and push go-on fixes

### What went well
- Confirmed four existing go-on commits were ahead of `origin/main`, ran `just ci`, and pushed them successfully.
- The working tree is clean and synchronized with `origin/main`.

### What was frustrating / slow
- No implementation work was needed; the required independent review skill remains unavailable at its documented path.

### What config change would have helped
- Install or replace `requesting-code-review/SKILL.md` so the documented review gate can run.

### Improvements for next time
- Check branch divergence before creating a redundant commit when asked to commit and push.

## 2026-08-28: Pi startup performance

### What went well
- Profiling isolated third-party TypeScript package loading and live provider discovery as the startup bottlenecks rather than Pi core.
- Cache-first Command Code startup and synchronous Openference fallbacks preserve provider access without blocking normal startup.
- A dedicated `bin/pi-fast` path provides roughly 1.34s median help startup for quick core-only tasks.

### What was frustrating / slow
- Startup timing was noisy because provider/network work runs concurrently and the repository lacks Deno/ShellCheck locally.
- The independent review skill remains unavailable at `/home/juan/.agents/skills/requesting-code-review/SKILL.md`.

### What config change would have helped
- A built-in Pi startup timing command would make package and provider regressions easier to track.

### Improvements for next time
- Keep optional provider catalogs cache-first and refresh explicitly or in the background.
- Benchmark interactive readiness separately from `--help` process exit time.

## 2026-08-28: Resolve rebase conflicts

### What went well
- Preserved both the go-on and startup-performance feedback while completing the rebase.
- `git diff --check` and `just ci` passed after resolution.

### What was frustrating / slow
- Two generated session artifacts conflicted because both branches appended same-day records.

### What config change would have helped
- A convention for merging same-day sweep worksheets would make artifact conflicts less ambiguous.

### Improvements for next time
- Resolve append-only feedback artifacts by preserving both records and grouping worksheet reports by review scope.

## 2026-08-29: Fish → Nushell cutover + cross-host deploy

### What went well
- Consolidated all shell secrets onto a single `environment.d` source (28 keys), removed `secrets/env.fish.*`, made Nushell the default shell, kept Fish as a tracked fallback. `just ci` green throughout.
- Applied the cutover across all four reachable hosts via SSH and verified 28/28 secrets load in Nushell on each: framearch-juan (local, `sudo chsh`), arch-wsl (pacman + chsh), mac-juan (brew + deploy), liedelpi (prebuilt aarch64 binary out-of-band).
- Discovered `~/.config/secrets/env-clean` was a plaintext secrets file; migrated its 2 unique keys (`NAN_API_KEY`, `CLOUDFLARE_API_KEY`) into the encrypted `environment.d` and shredded the plaintext file.
- Made liedelpi self-sufficient: copied the sops age key, installed prebuilt `sops` (arm64), so future `dotter deploy` can auto-decrypt once its repo is reconciled.

### What was frustrating / slow
- Secret leak: inspecting `env-clean` with a redaction command that only masked `KEY=` lines printed the fish `set -x KEY value` plaintext values into the transcript (all 16 keys). Earlier a Nushell error traceback also dumped `$env`. Keys need rotating.
- Nushell's eager parsing of SSH command strings: once a host's login shell became nu, every `ssh host 'cmd && cmd2'` broke with `nu::parser::shell_andand`. Worked around with `bash -lc`, base64'd scripts, and scp+`bash /tmp/script.sh`, but it cost several round trips. The irony: the cutover itself broke the tooling used to deploy the cutover.
- liedelpi's dotfiles repo is heavily diverged (357 local commits ahead / 666 behind, unpushed, only on its disk). This is unrelated to the cutover but blocked a normal `dotter deploy` and forced an out-of-band deploy.

### What config change would have helped
- A `just` recipe or bootstrap step that, per host, ensures `sops` + the age key are present before attempting secret deploy — would have surfaced liedelpi's missing age key / sops earlier.
- A note in AGENTS.md that after a login-shell change, SSH one-liners must use `bash -lc` (nu/fish parse the command line eagerly) would save the round trips.
- A pre-commit check that rejects plaintext secret files anywhere under `~/.config/secrets/` (not just `env.fish`) would have caught `env-clean` earlier.

### Improvements for next time
- When inspecting unknown secret files, redact by *line type* generically (mask anything after the first token on `set -x`/`export`/`KEY=` lines) rather than `KEY=`-only.
- Back up divergent per-machine repos (push to a `*-backup-<date>` branch) before any cutover work so unpushed WIP isn't a single-copy risk.
- Rotate the keys exposed in this transcript, especially `GITHUB_PERSONAL_ACCESS_TOKEN`.

## 2026-08-29: Resolve worksheet pull conflict

### What went well
- Preserved the newer local Fish → Nushell worksheet while fast-forwarding `main` to the remote reconciliation commits.
- `git diff --check` and `just ci` passed after the resolution.

### What was frustrating / slow
- The fast-forward was initially blocked because a newer untracked worksheet had the same path as an incoming tracked file.

### What config change would have helped
- A pull-safe worksheet convention or automatic preservation of tracked/untracked worksheet collisions would avoid the manual staging step.

### Improvements for next time
- Compare colliding artifacts before moving them, then restore the newer content after the fast-forward.

## 2026-08-29: Audit reconciled files

### What went well
- History made the merge safe to unwind: the reconciled files were additions from a backup branch, while the canonical first parent preserved the intended removals.
- Reverting with `-m 1` removed 555 stale files and retained the separate OAuth-token fix; `just ci` passed.

### What was frustrating / slow
- The merge had reintroduced a large stale skill tree and active Pi extensions despite the source cleanup commits explicitly removing them.

### What config change would have helped
- A reconciliation check comparing added paths against prior deliberate deletions would have caught the resurrection before merge.

### Improvements for next time
- Treat backup salvage as review-only until every reintroduced path is checked against deletion history and active deployment mappings.

## 2026-08-30: Harden Nushell setup

### What went well
- Found and fixed an XDG/Atuin path mismatch, terminal capability override, and repeated-config validation bug.
- Added atomic integration generation, stale-output cleanup, deterministic Atuin job cleanup, and stronger health assertions.
- `just ci` and repeated isolated-XDG health checks passed.

### What was frustrating / slow
- The first improved health check exposed an intermittent non-zero exit from Atuin's asynchronous index preparation job.

### What config change would have helped
- A dedicated Nushell integration test fixture would make optional-tool and background-job behavior easier to validate.

### Improvements for next time
- Always run health checks repeatedly when integrations spawn background work.

## 2026-08-30: harden Pi configuration

### What went well
- Reviewed Pi settings, trust scope, package pinning, and custom agent-directory integrations together.
- Fixed broad home-directory trust, pinned external packages, enabled the intended OpenCode Go model, and added guarded git/npm policies.
- Added custom-agent-directory regression coverage for Agy session persistence.

### What was frustrating / slow
- The repository-level npmrc emits a prefix warning during package tests, although the tests still pass.
- The independent review tool unexpectedly applied its plan edits; the resulting changes were inspected and retained where correct.

### What config change would have helped
- A first-class Pi configuration check could detect hard-coded `~/.pi/agent` paths and unpinned packages automatically.

### Improvements for next time
- Verify every independent review tool invocation for unintended writes immediately afterward.
- Keep provider integrations on the shared `PI_CODING_AGENT_DIR` resolver.

## 2026-08-30 follow-up: healthcheck config ownership

### What went well
- Found and fixed false high-severity drift reports caused by the intentional Pi clean filter and direct `PI_CODING_AGENT_DIR` ownership.
- The healthcheck now reports Config Hygiene A instead of treating stale fallback defaults as source failures.

### What was frustrating / slow
- The healthcheck still reports historical session volume and orphan worktrees; deleting them was intentionally avoided because it is destructive.

### Improvements for next time
- Keep expected source/runtime divergence explicitly classified so operational reports remain actionable.

## 2026-08-30 follow-up: portable session maintenance

### What went well
- Fixed Pi session inspection and pruning recipes to honor `PI_CODING_AGENT_DIR` and work on Linux as well as macOS.
- Added an explicit `project=all` mode while keeping deletion opt-in.
- Exercised both project-specific and all-project pruning against disposable data only.

### What was frustrating / slow
- The old pruning recipe was hard-coded to one macOS session path and would not act on the active Linux session store.

## 2026-08-30 follow-up: Openference catalog discovery

### What went well
- Traced the three-model behavior to the fallback catalog and explicit refresh-only logic.
- Changed Openference to fetch its live catalog before startup when authenticated, with a five-second timeout and fallback behavior.
- Enabled `openference/*` for model cycling and updated package documentation.

### What was frustrating / slow
- The provider package's `check` script has no `tsconfig.json`, so it invokes TypeScript help and exits nonzero; repository CI still validates all package TypeScript successfully.

## 2026-08-30 follow-up: dotfiles review fixes

### What went well
- The review found actionable cross-platform, bootstrap-safety, service-exposure, and documentation issues without changing encrypted payloads.
- Added Openference typechecking and catalog regression coverage; the package now passes its own check and two tests.
- Made generic Linux bootstrap safer by requiring explicit opt-in for host-specific `/etc` installation.
- Kept Aerospace out of non-macOS deployments and fixed Windows TOML path generation.
- Cleaned non-Herdr extension lint warnings while leaving the generated integration protected.
- Audited all llama.cpp bind overrides and kept the laptop service and stats bridge loopback-only by default.
- Removed the last hardcoded user home path from deployed Fish configuration.
- Exercised the secret deployment hook after making both Unix and Windows decryption atomic.
- Removed the published ntfy topic from tracked backup scripts and documented host-local configuration; the former topic still needs external rotation because it remains in Git history.
- Restored Windows bootstrap parity by creating the ignored npm source before Dotter runs.
- Added a host-local mode-0600 notification file so topic rotation does not touch encrypted repository secrets.
- Generated and installed a new private topic on both backup hosts without exposing it in output.
- Verified both hosts can publish notifications successfully through the rotated topic.

### What was frustrating / slow
- The ignored npm source was symlinked from inside the repository, so npm warned that its user-level `prefix` was being supplied as project configuration.

### Improvements for next time
- Keep user-level package-manager configuration outside repository paths while preserving the symlinked deployment contract; the source is now named `npmrc` rather than `.npmrc`.

## 2026-08-31: portable Memoryfield setup

### What went well
- Added and published the reviewed Memoryfield skill bundle without staging unrelated settings or skills.
- Installed and exercised the llama-server fork on liedelpi through the remote embedding service.
- Configured Nushell, Fish, and environment.d additively while leaving liedelpi's divergent checkout untouched.

### What was frustrating / slow
- The requested uv install cannot resolve `pysqlite3-binary` on ARM64; an isolated source checkout with that dependency removed was required to use the fork's stdlib SQLite fallback.

### Config change that would have helped
- Platform-conditional or optional `pysqlite3-binary` packaging would make the documented install command work directly on ARM hosts.

### Improvements for next time
- Check wheel/platform compatibility before attempting a fleet-wide uv tool install.

## 2026-09-03: Home Manager pilot and NixOS module contracts

### What went well
- Migrated all portable config (llama project files, presets, Brewfile, wrapper,
  Wayland desktop session) from Dotter to Home Manager without a single dual-ownership
  incident; the `dotter deploy --dry-run` check caught every stale cache entry.
- Validated future NixOS modules three ways: evaluation assertions in `nix flake check`,
  a disposable VM that booted to serial login, and isolated GPU smoke tests for both
  chat routing and the embedding endpoint.
- Preserved cross-machine parity by moving Linux desktop configs to a shared module
  imported by both Linux profiles instead of silently dropping WSL coverage.
- Kept the live Arch host, llama router, and embedding service untouched throughout;
  every test ran in isolated processes with cleanup.

### What was frustrating / slow
- Home Manager evaluation errors on untracked files (`not tracked by Git`) required
  a manual `git add -N` before each new module could be checked.
- Upstream CachyLLama's Nix package emits stdenv deprecation warnings on every
  evaluation; cosmetic but noisy.

### Config change that would have helped
- A flake check that tolerates or auto-stages new files, or a just recipe wrapping
  `git add -N` before `nix flake check`.

### Improvements for next time
- Stage new Nix files with `git add -N` immediately on creation.
- For directory migrations, enumerate files one-to-one rather than symlinking whole
  directories, so locally-created state files survive the ownership transfer.

## 2026-09-03: pi-agy hardening (review → implement → cross-review loop)

### What went well
- Reviewing the user's pi-agy extension before proposing improvements caught a latent
  accumulation bug and several UX gaps that pure feature work would have missed.
- The opposite-family adversarial review (sonnet, mode=plan effort=high) found 5 real
  bugs in my own two commits — 2 blockers (stderr catalog pollution, wrapper double-count).
  This validates the produce/cross-review split from AGENTS.md; it is not ceremony.
- Dogfooding: the review run exercised the new `effort` param and the default-model
  resolution path in production on the way in.

### What was frustrating / slow
- Deriving that agentq has no Antigravity quota signal took ~30 min of dead ends:
  resolve-model.sh returns OpenCode-only ids, brain transcripts have no model field,
  and the old mitmproxy usage proxy was removed in the August sweep.

### Config change that would have helped
- A one-line note in AGENTS.md's Pi section (or agentq's README) stating which
  providers have quota windows would have skipped the investigation entirely.
  (Mitigated: recorded in the 2026-09-03 daily log and the session worksheet.)

### Improvements for next time
- Before proposing quota-aware anything, check what quota data actually exists first.
- Route proposed-improvement lists through an adversarial review before merging even
  when tests are green — all 5 review findings survived a green suite.
