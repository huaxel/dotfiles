# @juanbenjumea/pi-agy

Enhanced fork of [`@bacnh85/pi-agy`](https://github.com/bacnh85/pi-extensions/tree/main/pi-agy) for the dotfiles Pi stack.

Delegates bulk work to the Antigravity CLI (`agy`) while Pi (on Cursor) stays the conductor.

## Install

In `pi/agent/settings.json`:

```json
"../packages/pi-agy"
```

Replace `npm:@bacnh85/pi-agy` with the local path above.

## What's different from upstream 0.3.1

| Feature | Upstream | This fork |
|---------|----------|-----------|
| Live progress | Final text only | `stream-json` → Pi `onUpdate` cards |
| Conversation resume | None | `conversation_id`, `continue`, session store |
| Verify injection | `npm test` only | `just ci` first, then `npm test` |
| Post-write summary | None | Appends `git diff --stat` |
| Preflight | Every call | Cached 5 min per process |
| Concurrency | Unlocked | Per-directory lock |

Auth is unchanged: existing `agy` OAuth (`~/.gemini/oauth_creds.json`).

## Tool params (new)

| Param | Description |
|-------|-------------|
| `conversation_id` | Resume agy conversation by ID |
| `continue` | `--continue` most recent conversation |
| `new_session` | Force fresh session; set `false` to reuse last ID for dir |
| `stream` | Use `stream-json` (default `true`) |
| `mode` | `accept-edits` by default; use `plan` for exploration/review |

## Human-callable `/agy` command

Run agy directly from the Pi TUI — fast path when fully specified, wizard otherwise:

```
/agy flash fix git conflicts        # fully specified → runs immediately
/agy plan sonnet review the diff    # mode + model + prompt
/agy plan                           # wizard: model select → task editor
/agy                                # wizard: mode → model → task editor
```

First token optional: `accept-edits` / `plan` / `sandbox` mode prefix, then a
model alias (`flash`, `pro`, `sonnet`, `opus`, `gpt-oss`, …), then the prompt.
The interactive wizard and direct `agy_execute` calls default to
`accept-edits`; the wizard confirms before writing. Use `plan` explicitly for
exploration/review. Sandbox runs do not bypass agy permission checks.

Missing pieces open interactive dialogs (mode select, model select with
descriptions, multi-line task editor). `accept-edits` asks for confirmation
before writing. The command then runs agy directly with the selected parameters;
progress is shown in the status bar and the final response is notified — no
second LLM turn or custom TUI surface.

## Development

```bash
cd pi/packages/pi-agy
npm test
```

## License

MIT
