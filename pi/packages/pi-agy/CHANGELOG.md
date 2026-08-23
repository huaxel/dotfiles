# Changelog

## Unreleased

- Keep sandbox runs behind agy permission checks instead of bypassing them.
- Make streamed result statuses visible in progress updates.
- Preserve clean successful responses when agy emits stderr diagnostics.
- Allow queued calls to cancel without blocking later runs in the same directory.
- Accept explicit `/agy accept-edits ...` mode prefixes.

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
- `/agy` delegates to the `agy_execute` tool: progress streams inline in the chat as a normal tool row and the result lands in the transcript (removed custom panel/overlay surfaces).
