# Changelog

## Unreleased

- Enforce `timeout_ms` across setup, preflight, and the agy process instead of adding an unconditional grace period.
- Preserve legacy `tier` selection in execution details and when configured default-model commands are present.
- Serialize session-store writes across independent Pi processes and ignore malformed history entries safely.
- Refresh model aliases from the live `agy models` catalog during preflight; newest generation wins, static map stays as fallback.
- Count per-directory lock wait toward the call timeout so queued runs cannot silently exceed their budget.
- Retry once when agy fails with a transient error (rate limit, network) before emitting any progress.
- Add an `effort` tool parameter passed through to `--effort`.
- Pass `--disable-slash-commands` so task text never triggers agy slash/skill expansion.
- Add optional `agy-config.json` with `skipPermissions`, `defaultModel`, and `defaultModelCommand` (quota/usage-aware default resolution); record `permissions_skipped` in tool details.
- `/agy continue`, `/agy timeout=10m`, and `/agy sessions` conversation picker; status updates throttled.
- Session store keeps up to 10 recent conversations per directory.
- Bound verify-command detection at the repository root; recognize `.justfile`, check the `just` binary, and add `uv run pytest` detection.
- Accumulate stream-json results regardless of whether a progress callback is attached.

## Post-review fixes (sonnet cross-review of b87019f + c65bb4a)

- Parse only stdout when refreshing the model catalog — stderr diagnostics can no longer pollute alias resolution.
- Numeric-aware model comparison so `claude-sonnet-4-10` sorts above `claude-sonnet-4-6`.
- Retry eligibility now requires real agy activity (tool steps / model responses); session-start chatter no longer suppresses the transient retry.
- The timeout budget starts before config/default-model resolution so a slow resolver cannot eat into it unaccounted.
- `agy-default-model.sh` no longer double-counts the latest conversation when the store has both legacy `last_*` fields and `history` entries.
- Cover extension registration and `/agy` argument completions in tests.

- Keep sandbox runs behind agy permission checks instead of bypassing them.
- Make streamed result statuses visible in progress updates.
- Preserve clean successful responses when agy emits stderr diagnostics.
- Allow queued calls to cancel without blocking later runs in the same directory.
- Accept explicit `/agy accept-edits ...` mode prefixes.
- Preserve multiline prompt formatting in `/agy` command arguments.
- Include staged files in postflight change summaries and preserve response endings when truncating output.
- Serialize session-store updates, write atomically, and keep conversation IDs in a private file.
- Resolve the Agy session store from `PI_CODING_AGENT_DIR` instead of always using `~/.pi/agent`.
- Detect `Justfile`, package `ci` scripts, and npm/pnpm/yarn/bun runners for verification.
- Ignore non-object JSON lines in streamed agy output safely.
- Keep direct `agy_execute` calls implementation-oriented with `accept-edits` as the default; use `plan` explicitly for review.

## 0.4.0

- Fork from `@bacnh85/pi-agy` 0.3.1 into dotfiles local package.
- Stream agy progress via `--output-format stream-json` and Pi `onUpdate`.
- Add `conversation_id`, `continue`, `new_session` for multi-turn handoffs.
- Persist last conversation per workspace in `~/.pi/agent/agy-sessions.json`.
- Detect `just ci` for verify-loop injection (falls back to `npm test`).
- Append git diff summary after `accept-edits`.
- Cache preflight health/connectivity checks for 5 minutes.
- Serialize concurrent calls per working directory.
- Add human-callable `/agy [plan|sandbox] [model] <prompt>` TUI command with model autocomplete.
- `/agy` wizard UX: interactive mode select, model select with descriptions, multi-line task editor, accept-edits confirmation.
- `/agy` executes agy directly after confirmation: progress uses the status bar and the final response is notified without a second LLM turn.
