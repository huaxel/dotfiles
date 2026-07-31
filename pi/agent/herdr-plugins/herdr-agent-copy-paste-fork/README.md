# Fork for Herdr

Fork branches the agent conversation in your current pane into a **new tab** or a
**vertical split** with a single hotkey. It reads the pane's native session
reference, opens the new pane, and resumes that session as a fresh, independent
branch — so you can ask throwaway questions or explore a tangent without
disturbing the original conversation.

It auto-detects the agent and uses each tool's own fork mechanism:

| Agent | How it forks | Original |
| --- | --- | --- |
| Claude Code | `claude --resume <id> --fork-session` | untouched |
| Codex | `codex fork <session-uuid>` | untouched |
| Pi | `pi --fork <session-path-or-id>` | untouched |

Both commands create a genuinely separate session; the source conversation is
never modified.

There are two ways to place a fork:

- **Fork here** — one hotkey reads the current pane and immediately opens the
  fork in a new tab or split.
- **Copy / paste** — one hotkey copies the current session to a reusable "fork
  clipboard"; later, another hotkey starts that session in whichever pane you are
  focused on. This decouples *capturing* the session from *choosing where it
  lands*.

The plugin supports macOS and Linux.

## Requirements

- Herdr 0.7.5 or newer
- [`jq`](https://jqlang.github.io/jq/) on `PATH`
- The agent CLI you fork into: `claude` (Claude Code), `codex`, and/or `pi`, on `PATH`
  in the workspace where the new tab launches
- Optional: `python3` and `perl` on `PATH`. When present, the forked pane records
  the agent session and replays the agent's final on-screen output (e.g. its
  resume hint) after it exits, instead of leaving a blank pane. Without them the
  fork still works — it just holds the pane open with no replay.

The plugin uses no network access and stores no credentials.

## Install

```sh
herdr plugin install calebcauthon/herdr-agent-copy-paste-fork
```

To link a local checkout (no build step — this is a bash plugin):

```sh
herdr plugin link .
```

## Bind your key

Add bindings to `~/.config/herdr/config.toml`. The keys are examples; choose any
non-conflicting Herdr bindings:

```toml
[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "herdr-plugins.fork.fork"
description = "fork the current agent conversation into a new tab"

[[keys.command]]
key = "prefix+shift+f"
type = "plugin_action"
command = "herdr-plugins.fork.fork-split"
description = "fork the current agent conversation into a vertical split"

[[keys.command]]
key = "prefix+c"
type = "plugin_action"
command = "herdr-plugins.fork.copy"
description = "copy the current agent conversation to the fork clipboard"

[[keys.command]]
key = "prefix+v"
type = "plugin_action"
command = "herdr-plugins.fork.paste"
description = "paste the copied fork into the focused pane"
```

`prefix+c` is Herdr's default `new_tab` binding, so rebind that in the `[keys]`
section if you want the copy/paste mnemonic:

```toml
[keys]
new_tab = "prefix+t"
```

Reload Herdr configuration:

```sh
herdr server reload-config
```

Focus a pane running Claude Code or Codex, press a binding, and the forked
conversation opens resumed and idle — in a new tab, or in a new split beside the
current pane — waiting for your next message.

To copy/paste instead: press the copy binding in the source pane, focus (or
create) the pane you want the fork in, then press paste. The paste target should
be sitting at a shell prompt — paste types `claude --resume … --fork-session`
(or `codex fork …`) into it and runs it. Copying stays on the clipboard, so you
can paste the same fork into several panes; copying again replaces it.

## What it declares

| Kind | ID | Behavior |
| --- | --- | --- |
| action | `fork` | Opens the forked session in a new tab |
| action | `fork-split` | Opens the forked session in a vertical split (to the right) |
| action | `copy` | Captures the current pane's session to the fork clipboard |
| action | `paste` | Runs the copied session as a fork in the focused pane's shell |
| pane | `session` | Resumes the forked session; placement is set per-action at open time |

`fork` and `fork-split` run the same script; they differ only in the placement
flags they pass (`--placement tab` vs. `--placement split --direction right`).
"Vertical" here matches Herdr's `split_vertical` convention — a new pane to the
**right**. `copy` and `paste` are the deferred-placement variant: `copy` writes
the session to a clipboard file and `paste` types the resume command into the
focused pane via `herdr pane run`. There are no events, link handlers, or startup
hooks.

Invoke an action manually for testing:

```sh
herdr plugin action invoke herdr-plugins.fork.fork
herdr plugin action invoke herdr-plugins.fork.fork-split
herdr plugin action invoke herdr-plugins.fork.copy
herdr plugin action invoke herdr-plugins.fork.paste
```

## How it works

1. The action resolves the current pane (`HERDR_PANE_ID`, falling back to
   `HERDR_PLUGIN_CONTEXT_JSON`) and calls `herdr pane get <pane-id>`.
2. It extracts the `agent_session` object (its `agent` and `value`) and the
   pane's `foreground_cwd`. If the pane has no forkable session, it stops with a
   notification and changes nothing.
3. It runs `herdr plugin pane open --entrypoint session`, passing the fork
   parameters straight through as `--env HERDR_FORK_AGENT=…`,
   `--env HERDR_FORK_VALUE=…`, and `--cwd <foreground_cwd>`, plus the placement
   flags from the action (`--placement tab`, or `--placement split
   --direction right`).
4. The new pane (`launch.sh`) reads those environment variables and runs the
   agent's fork command in the original working directory. When the agent exits —
   including when you Ctrl-C out of it — the pane drops to an interactive login
   shell instead of closing, so the tab or split stays open (Ctrl-D closes it).
   The same shell is the fallback when anything is missing: no fork value, the
   agent CLI not found, or an unrecognized agent.

For fork-in-place the parameters travel entirely through `--env`/`--cwd`, so
there are no shared state files and no race even if several forks fire at once.

Copy/paste spans two separate keypresses, so it does use one small file:

1. `copy` resolves the current pane, reads its `agent_session`/`foreground_cwd`
   the same way, and writes `{agent, value, cwd}` to `clipboard.json` under
   `HERDR_PLUGIN_STATE_DIR` (mode `0600`). Nothing is opened.
2. `paste` reads `clipboard.json`, builds the resume command for that agent, and
   runs it in the focused pane with `herdr pane run <pane-id> <command>` — which
   submits the text plus Enter atomically. It does not clear the clipboard, so
   the same fork can be pasted into several panes.

## Configuration and state

There is no user configuration. Fork-in-place writes nothing to disk (handoff is
via the new pane's environment). Copy/paste keeps a single reusable clipboard at
`HERDR_PLUGIN_STATE_DIR/clipboard.json` (mode `0600`), holding only the agent
name, resume value, and working directory — no conversation content. Copying
overwrites it; it is otherwise left in place.

## Failure behavior

- A pane with no agent session is left untouched; nothing is opened or copied.
- If opening the fork pane fails, the action exits nonzero with a notification.
- If the target agent CLI is missing or unrecognized, the new pane falls back to
  a login shell rather than closing.
- Ctrl-C (or any exit) out of the forked agent leaves the pane on a login shell;
  press Ctrl-D to close it.
- `paste` with an empty clipboard, or with an unrecognized agent in it, reports
  the problem and runs nothing.

## Notes and caveats

- **Codex session reference.** `codex fork` expects a session UUID. The plugin
  passes `agent_session.value` through, and if Herdr supplies a rollout file
  path instead, it recovers the UUID embedded in the filename. If your Herdr
  version reports the reference in some other shape, confirm the value that
  `herdr pane get <pane-id>` prints for a Codex pane and adjust `launch.sh`.
- **Split direction.** `--direction` accepts `right` or `down`; `fork-split`
  uses `right` (a side-by-side "vertical" split, matching Herdr's
  `split_vertical`). Change it to `down` in the manifest for a stacked split.
- **New-pane semantics** assume `herdr plugin pane open` creates a fresh pane per
  invocation. Verify against your Herdr version if forks unexpectedly reuse one.

## Development

```sh
bash tests/run.sh        # host-free end-to-end test with stubbed binaries
bash -n scripts/*.sh     # syntax check
shellcheck -x scripts/*.sh tests/run.sh   # if installed
```

The test stubs `herdr`, `claude`, and `codex`. It asserts the `herdr plugin pane
open` command `fork.sh` builds for both tab and split placements, the argv each
agent would have been launched with by `launch.sh` — including Codex UUID
recovery from a rollout path — and the copy/paste round trip: that `copy.sh`
captures the session to the clipboard and `paste.sh` builds the right
`herdr pane run` command from it.

Link and inspect the linked plugin:

```sh
herdr plugin link .
herdr plugin list --plugin herdr-plugins.fork --json
herdr plugin action list --plugin herdr-plugins.fork
herdr plugin log list --plugin herdr-plugins.fork
```

## Logs and cleanup

```sh
herdr plugin log list --plugin herdr-plugins.fork
herdr plugin unlink herdr-plugins.fork      # unregister a local checkout
herdr plugin uninstall herdr-plugins.fork   # remove a GitHub-managed install
```

## Security summary

- Every fork, copy, and paste requires a manual keypress; nothing runs
  automatically.
- No network access and no credentials.
- Reads only the current pane's session reference and working directory.
- Fork-in-place writes nothing to disk. Copy/paste stores only the agent name,
  resume value, and working directory in a `0600` clipboard file — no
  conversation content.
- `paste` types a resume command into the focused pane; it runs only in the pane
  you invoke it from.
- Does not modify the source conversation or any agent configuration.

See [LICENSE](LICENSE) for licensing terms.
