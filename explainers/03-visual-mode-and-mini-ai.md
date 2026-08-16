# Lesson 3: Visual Mode and mini.ai's Extended Text Objects

Sources: [Vim user manual ch. 4 — visual mode](https://vimhelp.org/usr_04.txt.html) · [visual.txt](https://vimhelp.org/visual.txt.html) · [mini.ai docs](https://github.com/echasnovski/mini.ai) · [your LazyVim mini.ai spec (verified in `lua/lazyvim/plugins/coding.lua`)](https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/plugins/coding.lua)

---

## Part A — Visual mode: the selection interface

Three flavors, all starting from normal mode:

| Key | Selection | Use for |
|---|---|---|
| `v` | character-wise | exact fragments |
| `V` | line-wise | whole lines |
| `<C-v>` | block-wise (column) | the same column across many lines — vim's built-in multi-cursor |

Once selected, the **operators from Lesson 1 apply to the selection**: `d` cut, `c` change, `y` copy, `>` `<` indent, `=` format.

### The commands worth knowing

- `o` — flip cursor to the other end of the selection
- `gv` — **re-select the last visual selection** (tweak it, re-indent it, copy it again)
- `:'<,'>sort` — sort the selection (ex commands operate on the selection automatically)
- `:'<,'>normal .` — run the last change on every selected line (the `.` command + visual = batch edit)
- `V` then `j` then `>` — select lines and indent them

### Block mode superpowers (this is the big one)

`<C-v>`, select a column over several lines, then:

- `I` + type text + `<Esc>` → **inserts that text on every selected line** (e.g. comment `// ` or a `#` on 5 lines)
- `A` + type + `<Esc>` → appends at the end of every selected line
- `c` → change the selected column on all lines at once

This is the "multi-cursor" that IDEs charge for — it's built in.

> **Try this**: create 5 identical lines. `<C-v>` on the first char, `jjjj` (or `4j`), `I`, type `// `, `<Esc>`. All five get the comment. Then `gv` to re-select and play with `A`.

## Part B — mini.ai: your config's extended text objects

mini.ai ships with LazyVim (see [coding.lua](https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/plugins/coding.lua)), and LazyVim adds **treesitter-backed objects** on top of the defaults. All work as `i` + key (inner) or `a` + key (around), cursor anywhere inside:

| Keys | Object | Notes |
|---|---|---|
| `ia` / `aa` | function argument | `cia` in `foo(a, b, c)` changes just `b` |
| `ii` / `ai` | indent block | whole indented body — great for Python, no braces needed |
| `if` / `af` | function (treesitter) | `cif` changes the whole function body |
| `ic` / `ac` | class (treesitter) | |
| `io` / `ao` | code block (treesitter) | `if`/`for`/`while` bodies — `cio` |
| `id` / `ad` | number | `cid` changes a digit, cursor anywhere in it |
| `iu` / `au` | function call | "usage" — `ciu` rewrites `foo(...)` call sites |
| `it` / `at` | HTML tag | |
| `ig` / `ag` | whole buffer | |

The treesitter ones (`if`, `ic`, `io`) are *structural* — they understand your code's shape, not just characters. `cif` in the middle of a 40-line method replaces the entire method. That's the IDE feeling.

> **Try this**: in a real C# method, `cif` (change inner function) — replaces the whole method body. In `Foo(1, "x", true)`, `cia` on the `"x"` changes just that argument. `cid` on a number changes it.

## What's next

- **Lesson 4**: macros — `q` records keystrokes into a register, `@q` replays. "Edit once, replay forever." Closes the core-grammar arc.
- After that, sessions pivot to **your config**: the which-key map, LSP/format/test workflow, git — the "understand my nvim" half of the mission.
