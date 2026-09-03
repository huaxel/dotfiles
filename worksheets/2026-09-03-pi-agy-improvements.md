# Session: pi-agy hardening (2026-09-03)

Scope: `pi/packages/pi-agy` (fork of `@bacnh85/pi-agy`), `bin/agy-default-model.sh`,
`pi/agent/agy-config.json`. Commits: `b87019f` → `c65bb4a` → `d0dcae6`.

## Context

User asked whether to use the agy ACP bridge instead of their pi-agy extension.
Conclusion: keep pi-agy (ACP bridge is third-party, adds a PTY + SQLite layer,
ToS risk); ACP only if multi-agent orchestration is wanted. User then asked what
to improve in pi-agy; the 11-item review was implemented in full.

## What shipped

1. **Correctness**
   - Stream-json accumulation un-gated from the progress callback (latent bug:
     run metadata lost when no callback attached).
   - Per-directory lock wait counts against the caller timeout; the agy run
     receives the remaining budget.
   - Verify detection bounded at the git root (no parent-repo / `$HOME`
     justfile leakage into worktrees); `.justfile`; `just` binary probe;
     `uv run pytest` detection for Python projects.
   - Live model catalog: preflight parses `agy models` stdout (newest
     generation wins per alias); static map stays as fallback.
2. **Capability**
   - `effort` tool param → `--effort` (first production use: the review run
     below ran `sonnet effort=high mode=plan`).
   - Session store keeps 10 recent conversations per dir; `/agy sessions`
     picker resumes any of them; `/agy continue` + `/agy timeout=10m` tokens;
     throttled status bar; confirmations show the resolved concrete model.
   - `--disable-slash-commands` so task text never triggers agy slash/skill
     expansion.
3. **Safety / ops**
   - `agy-config.json`: `skipPermissions` (default true) + `defaultModel` +
     `defaultModelCommand`; `permissions_skipped` recorded in tool details.
   - Single retry on transient failures only when zero agy *activity* was seen
     (tool steps / model responses), so edits cannot double-apply.
   - **Quota-aware default**: `defaultModelCommand` → `bin/agy-default-model.sh`
     flips `flash-medium` → `sonnet` when Gemini carried ≥75% of last-24h
     conversations (min 3). Resolution: call model > `defaultModel` > command
     > `flash-medium`.

## Key decision: usage-balance, not quota windows

agentq has **no Antigravity quota signal**: `quota.json` covers only
opencode-go/codex; `resolve-model.sh` returns OpenCode ids agy cannot serve;
brain transcripts lack model attribution; the mitmproxy usage proxy was removed
in the August sweep. pi-agy's own session store is the only real per-family
signal, hence the usage-balance wrapper. If Antigravity ever exposes quota
windows, swap the wrapper internals — the `defaultModelCommand` interface stays.

## Verification

- Tests 41 → 66, all passing; fake `agy` binary records argv and scripts
  transient failures (including one that emits `init` first, covering the
  retry-eligibility regression).
- `just ci` green after each commit; shellcheck clean.
- **Sonnet adversarial cross-review** (`mode=plan effort=high`) found 5 real
  bugs (2 blockers): stderr leaking into catalog parsing, lexicographic version
  compare (4-10 < 4-6), init event suppressing the retry, timeout budget
  starting after config resolution, wrapper double-counting the latest
  conversation. All fixed in `d0dcae6` with regression tests.

## Follow-ups

- If Antigravity exposes real quota windows: rewire the wrapper.
- `justBinaryProbe` in `verify.ts` has no reset hook (minor; `justAvailable`
  injection point exists for tests).
