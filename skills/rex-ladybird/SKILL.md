---
name: rex-ladybird
description: Drive the Ladybird browser that runs inside a rex pane, by hand or from an agent — open addresses from shell history, switch tabs, follow links, and read or click a live page through ladyctl. Use for anything involving Ladybird, rex-ladybird, ladyctl, opening a page in the browser pane, or automating that browser.
---

# Ladybird in a rex pane

A real browser, reachable from the same terminal you already work in.

```
rex pane  ──►  Ladybird --headless=terminal  ──►  page
  │                    │                             │
  │ ctrl+b keys        │ APC commands over stdin     │ DevTools on 127.0.0.1:9317+
  │ rex-<action>s      │ ESC _ ladybird;<cmd> ESC \  │ ladyctl, page JS
```

Three independent surfaces, and knowing which one you are on explains every
behaviour below:

| layer | who owns it | what it can do |
| --- | --- | --- |
| Rex | panes, pickers, keys | decide where a page opens, choose what to load |
| terminal mode | the pane's TTY | navigate, go back, reload, quit, hide its status line |
| DevTools | `127.0.0.1:9317` and up | read the real URL and title, run JS, list links, click |

`ladyctl` speaks the last two. `~/.config/rex/rex-ladybird` (a link into
`~/projects/rex-ladybird`) is the module that ties them to Rex. Nothing here
needs a plugin, an extension API, or a patched binary — except one optional
patch described at the end.

## By hand

Every action is under `ctrl+b`:

| keys | action | what happens |
| --- | --- | --- |
| `ctrl+b w` | `ladybird_open` | pick from Chrome history or type an address, load it in the current pane |
| `ctrl+b l` | `ladybird_new` | new pane beside this one, at the picked address |
| `ctrl+b n` | `ladybird_tab_new` | new tab (a zoomed full-window block) |
| `ctrl+b b` | `ladybird_tabs` | switch tab |
| `ctrl+b x` | `ladybird_tab_close` | close a tab |
| `ctrl+b k` | `ladybird_links` | pick a link off the current page |
| `ctrl+b c` | `ladybird_click` | pick any control on the page — button, field, menu item — and click it |
| `ctrl+b u` | `ladybird_url` | copy the current address to the clipboard |

The everyday loop is `ctrl+b w` instead of `ctrl+l`: you get a Rex picker over
your own Chrome history, with fuzzy search, instead of a one-line prompt at the
bottom of the terminal. Inside the page, links open with the mouse; `ctrl+b k`
is for the pages that hide them behind something unclickable.

Panes and tabs are the same object. A pane is a block you can see tiled; a tab
is that block zoomed to fill the window. Both hold a browser, both appear in
`ctrl+b b`.

## From an agent

An agent gets the same actions without a picker, and the page itself through
the CLI.

```bash
rex do ladybird_open url=https://example.org --json      # load in the existing pane
rex do ladybird_new  url=https://example.org --json      # a second browser, own port
rex do ladybird_url  --json                              # {block_id, source, title, url}
```

```bash
ladyctl url                       # https://example.net/
ladyctl title                     # Example Domain
ladyctl eval 'document.querySelector("h1").textContent'
ladyctl --json links              # [{text, href}] as the live DOM reports them
ladyctl open https://example.org  # navigate without touching the address bar
ladyctl back | forward | reload
```

To operate a page rather than read it, `snapshot` comes first: it numbers every
control and the numbers are what the other commands take.

```bash
ladyctl snapshot --list           # e1<TAB>text<TAB>Search … e4<TAB>button<TAB>Go
ladyctl snapshot | head -20       # the same, plus the page text
ladyctl click e4                  # pointer events, scrolled into view
ladyctl type e1 'rex ladybird' --clear --submit   # real keystrokes, then Enter
ladyctl press tab enter
ladyctl wait --text Saved --timeout 10
```

Refs belong to one snapshot of one document: a reload, a navigation, or a page
that re-renders under you makes them fail with `no element e3`, which is
deliberate — take another snapshot instead of letting `e3` mean something else.

**Always pass `url=` to an action.** Without it the action opens a Rex picker
and waits for a human — correct for a person at the keyboard, a hang for a
script.

**You cannot see the page from the terminal.** `rex capture -b <block>` returns
one newline: the page is drawn as graphics, not scrollback. Read the page
through `ladyctl snapshot` (the control inventory plus the visible text),
`ladyctl eval` (any JS, JSON-serialisable result), `ladyctl links`, and
`ladyctl title`. If you need layout or styling, evaluate the elements you care
about rather than guessing from a screenshot you cannot take.

A worked session — check what a page says, then act on it:

```bash
ladyctl --port 9317 eval 'location.host'                       # confirm which browser
ladyctl eval '[...document.querySelectorAll("form")].length'   # anything to fill?
ladyctl eval 'document.querySelector("input[name=q]").value'   # read state
ladyctl eval 'document.title = "seen"'                         # or mutate it
ladyctl open 'https://example.org/?q=rex'                      # then navigate
```

`eval` runs in the page's main world, so it sees the DOM the user sees and the
page's own globals. It takes an expression or a function body — `const n = 2;
return n * 21` — and it awaits promises, so a script can wait for something the
page does itself. It does not survive navigation, and it cannot drive the browser
chrome. A script that throws exits 1 with its own message; one that will not
parse exits 1 with `no evaluation result`, because Ladybird answers nothing at
all in that case.

## Seams worth knowing

- **Several panes, one CLI.** `ladyctl ls` lists the panes the module launched
  (block, port, address, title), and `-b` picks one for any command: a block id,
  an id suffix, or part of its address. Without `-b` the CLI drives the newest
  pane, from `~/.local/state/rex-ladybird/{current,port}`. Pass `--port` only
  when you know the port and the pane is not in the registry.
- **Ports are per pane.** Panes get `9317`, `9318`, … from a free slot, each
  recorded in `…/rex-ladybird/tabs` as `block_id<TAB>port<TAB>url`.
  Entries whose block has left its window are dropped on the next read, so a
  pane closed by hand needs no cleanup.
- **A failed DevTools bind is silent.** If two panes ever share a port, the
  second browser renders fine and `ladyctl` talks to the first. Check
  `ladyctl url` against what you expect before trusting a result.
- **The status line is optional.** With the patch installed (see below) the
  page fills the pane and `ctrl+l` is ignored. On a stock build the module's
  attempt prints a transient "unknown command: chrome" notice and the last row
  stays a status line.

## When nothing happens

| symptom | cause | fix |
| --- | --- | --- |
| `no element e3` | the snapshot is older than the page | `ladyctl snapshot --list` again |
| nothing typed into the field | the element did not take focus | click it first; `type` refuses rather than typing blind |
| command returns after a long pause, nothing opens | a picker action ran without `url=` | pass `url=`; a picker needs a human |
| `ladyctl: connection refused` | no browser is running on that port | `cat ~/.local/state/rex-ladybird/tabs`, or open a pane |
| `ladyctl` prints a stale title | it is talking to an older pane | `ladyctl ls`, then `-b <block or address part>` |
| `unknown command: chrome` in the pane | stock build, no patch | rebuild from the patch; harmless otherwise |
| the last row is a status line | same | same |

## Reference

- `references/commands.md` — every `ladyctl` subcommand, every module action and
  option, the state file formats, and the one-file patch that hides terminal
  mode's status line.
- `~/projects/rex-ladybird` — module, CLI, tests (`bash test/run.sh`), and
  `docs/PR-status-line.md`.
