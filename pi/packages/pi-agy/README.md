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

## Human-callable `/agy` command

Run agy directly from the Pi TUI without going through the model:

```
/agy flash fix git conflicts
/agy plan sonnet review the diff
/agy sandbox pro estimate the refactor
/agy just run the tests
```

First token optional: `plan` / `sandbox` mode prefix, then a model alias
(`flash`, `pro`, `sonnet`, `opus`, `gpt-oss`, …; default `flash-medium`), then
freeform prompt. Result (and diff summary for accept-edits) renders in a
scrollable panel — `↑↓` scroll, `Esc`/`Enter` close.

## Development

```bash
cd pi/packages/pi-agy
npm test
```

## License

MIT
