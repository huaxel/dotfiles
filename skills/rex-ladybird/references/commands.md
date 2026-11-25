# rex-ladybird reference

Everything here is measured against `~/projects/rex-ladybird` (the module and
CLI) and a Ladybird build from `~/projects/ladybird`. Source of truth for the
prose is the repo's own `README.md`; this file is the index an agent needs.

## `ladyctl`

```
ladyctl [-b TARGET] [--port PORT] [--json] <command> ...
```

`-b` picks the pane: a block id, an id suffix, or part of the url it was opened
at, resolved against `$STATE/tabs`. Without it the recorded pane (`$STATE/current`)
is driven. A target that matches two panes is refused with the count, not guessed.

| command | arguments | reads through | notes |
| --- | --- | --- | --- |
| `ls` | — | `$STATE/tabs` + a liveness probe | `{block, port, url, title, live}` per pane; a pane that listens but does not answer keeps `live: true` and gets no title |
| `focus` / `close` | `-b TARGET` | `rex focus` / `rex block close` | TARGET goes to Rex as given, so a label or suffix works |
| `tabs` | — | DevTools `listTabs` | `{title, url, actor}` per tab |
| `url` | — | DevTools, status line as fallback | the address the browser actually has |
| `title` | — | DevTools | page title |
| `open` | `url` | DevTools `navigateTo`, APC `open` as fallback | no address bar involved |
| `back` / `forward` / `reload` | — | DevTools, APC fallback | |
| `eval` | `script` (`-` reads stdin), `--timeout N` (default 30) | DevTools `evaluateJSAsync`, twice | main world; an expression or a function body (`const n = 2; return n * 21`), and promises are awaited. A script that throws exits 1 with its own message; one that will not compile exits 1 with `no evaluation result`, since Ladybird sends nothing at all |
| `links` | `--limit N` (default 200) | `eval` over the live DOM | `{text, href}`, absolute hrefs |
| `snapshot` | `--list`, `--max N` (default 20000), `--json` | `eval` over the live DOM | numbers every operable control `e1, e2, …`, marks each with `data-lb-ref`, and returns `{title, url, elements, text}`; `--list` prints `ref<TAB>kind<TAB>label[<TAB>flags]` for pickers |
| `click` | `target`: a ref such as `e2`, or a CSS selector | `eval` on the match | scrolls it into view, then dispatches `pointerdown, mousedown, focus, pointerup, mouseup, click`; prints `clicked`; exits 1 with `no element matches SELECTOR` or `no element e9` |
| `type` | `target`, `text?`, `--clear`, `--submit` | DevTools to focus, `rex send` for the text | real keystrokes, so autocomplete and framework models see them; refuses to type (`did not take focus`) rather than typing into whatever has focus |
| `press` | `keys…` | `rex send-key` | `ladyctl press tab enter`, `ctrl+a` |
| `wait` | `--selector S`, `--text T`, `--timeout N` (default 30) | DevTools, re-attaching after navigation | exits 1 with `waited Ns for the page to show S` |
| `chrome` | `on` / `off` | APC | hides terminal mode's status line (needs the patch) |
| `quit` | — | APC | closes the browser, not the pane |

`--port` defaults to the port the module recorded last. Without a port the CLI
also reports the pane it was last pointed at.

Exit status is meant for scripts: 1 on an unreachable DevTools server
(`cannot reach the devtools server on PORT`), on a failed `click`, and on an
`eval` that produced no result. `--json` prints one object or array so a caller
never parses prose.

## Module actions

Registered by `require("rex-ladybird").setup{}` under the `Browser` category,
all with keywords `ladybird browser web page url`. Every action accepts an
optional `url` argument; the ones marked *picker* open a Rex picker and wait
when it is absent.

| action | args | behaviour |
| --- | --- | --- |
| `ladybird_open` | `url?` | load in the pane the module resolves (focused → recorded → labelled), launching one if none exists |
| `ladybird_new` | `url?` | split beside the focused block at ratio 0.60, own DevTools port, recorded as a tab, **not** zoomed |
| `ladybird_tab_new` | `url?` | split beside the anchor at ratio 0.5, own port, recorded, zoomed to fill the window |
| `ladybird_tabs` | — | *picker*: live tabs only; picking one zooms its block |
| `ladybird_tab_close` | — | *picker*: close the block running the chosen tab |
| `ladybird_links` | — | *picker*: links from the live DOM, loaded into the current pane |
| `ladybird_click` | — | *picker*: every control `ladyctl snapshot --list` reports, clicked by ref through `ladyctl click` |
| `ladybird_url` | — | DevTools first, status line second, copies to the clipboard via `pbcopy` |

Return values (`rex do … --json`) are plain tables, e.g.
`{"block_id":"block:…","port":9317,"opened":true,"url":"https://example.net"}`.

## Pane resolution

1. the focused block, when the terminal reports it is running Ladybird;
2. the block an earlier action drove (`$STATE/current`);
3. a block whose label equals `label` (default `Ladybird`), then one whose label
   starts with it.

Detection asks the terminal for the block's process
(`com.superlogical.terminal.process`, matching `Ladybird` or `Ladybird.app`), not
the status line, which is truncated to the pane width.

## State

`${XDG_STATE_HOME:-~/.local/state}/rex-ladybird/`

| file | content |
| --- | --- |
| `current` | block id of the pane the module last drove |
| `port` | its DevTools port, newline-terminated |
| `tabs` | one `block_id<TAB>port<TAB>url` per pane the module created |

`tabs` is a cache, not a database: entries whose block has left its window are
dropped when the file is read (port allocation, the picker). Deleting the
directory is always safe — it costs the remembered pane, nothing else.

## Launch line

```
<binary> --headless=terminal --devtools=<port>
         --profile-path=<profile> --device-pixel-ratio=<n> --url=<url>
```

`--profile-path` with a persistent directory, never `--profile NAME`: named
profiles are not created in headless mode (it makes an empty directory and no
database). Cookies and the password store live in that directory, which is why
an imported Chrome cookie jar (`bin/ladybird-import-chrome-cookies`) survives
restarts.

A page can also be driven by writing the APC line straight into the pty:

```
ESC _ ladybird;open;https://example.com ESC \
```

Terminal mode implements `open`, `back`, `forward`, `reload`, `quit`, `frames`,
and (with the patch) `chrome`. Unknown commands answer with a five-second
notice in the pane.

## DevTools protocol, as far as Ladybird implements it

Length-prefixed JSON over TCP (`<len>:<json>`). The parts that exist:

```
root     listTabs                            -> tabs[].{actor,title,url,browserId}
tab      getWatcher                          -> watcher actor
tab      navigateTo {url} | goBack | goForward | reloadDescriptor {bypassCache?}
watcher  watchTargets {targetType:"frame"}   -> target-available-form
target   {actor, consoleActor, inspectorActor, threadActor, styleSheetsActor}
console  evaluateJSAsync {text}              -> resultID, then evaluationResult
```

No `attach` on tab or frame: the child actors arrive inside
`target-available-form`. There is no `evaluateJSRequest` — the console accepts
`evaluateJSAsync` only. A screenshot is not available here; Ladybird's
WebDriver BiDi server has `browsingContext.captureScreenshot`, but that is a
different endpoint and not what a pane exposes.

## The patch

`patch/ladybird-status-line.patch` adds a `chrome` command to terminal mode,
reserves the last row for the status line only when it is shown, and ignores
`ctrl+l` while it is hidden (the prompt would be typed blind). Committed in the
Ladybird checkout on branch `terminal-status-line-toggle`.

```sh
cd ~/projects/ladybird && git apply ~/projects/rex-ladybird/patch/ladybird-status-line.patch
./Meta/ladybird.py build
```

Set `hide_status_line = false` in `setup{}` for a stock binary; the module then
leaves the status line alone and reads the address from DevTools anyway.
