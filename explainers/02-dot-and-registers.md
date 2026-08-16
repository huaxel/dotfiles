# Lesson 2: The Dot Command and Registers

Sources: [Vim user manual ch. 4 — small changes & registers](https://vimhelp.org/usr_04.txt.html) · [change.txt — `.` and registers](https://vimhelp.org/change.txt.html) · [Practical Vim (Drew Neil)](https://www.goodreads.com/book/show/13607232-practical-vim)

---

## Part A — The dot command (`.`)

`.` **repeats the last change** — the last edit that modified the buffer. Not movement, not search — the change itself.

- `x` then `.` → deletes the next character, forever, one per press
- `dd` then `.` → keeps deleting lines
- `ciw` + type `"foo"` then `.` → replaces the *next* word with `"foo"` — the whole edit repeats, including the text you typed
- `3.` → repeat the last change 3 times

Practical Vim opens with `.` for a reason — [it's the highest-leverage command in vim](https://blog.tomasino.org/review-practical-vim-edit-text-at-the-speed-of-thought/). Most editing is "do this same small edit again" — `.` is one key for that, where IDEs make you redo the whole gesture.

> **Try this** — in a scratch buffer, `ciw` a word and type `foo`. Then `.` on each next word. Then on a list of lines, `dd` once and `.` three times. Then `x` and hold... `.` `.` `.`.

## Part B — Registers (vim's clipboard system)

Every yank and delete writes a copy into **registers** — named slots that survive until overwritten. `p` pastes from the main one. `:reg` shows them all.

| Register | Name | What it holds |
|---|---|---|
| `"` | unnamed | every yank/delete — this is what `p` pastes from |
| `0` | yank-only | the **last yank** only (deletes never touch it) |
| `1`–`9` | numbered | delete/change history, shifted on each delete |
| `a`–`z` | named | manual slots: `"ay` yank to `a`, `"ap` paste from `a` |
| `_` | black hole | delete forever, stores nothing: `"_dd` |
| `q`… | macro | recorded keystrokes — a later lesson |

### The traps and tricks

- **`0` is yanks only.** `yy` then `dw` — the unnamed register now holds the deleted word, so `p` pastes the wrong thing. But `"0p` still pastes your yanked line, because yanks write `0` and deletes never do. (We discovered this empirically while testing your config — deletes go to `"` and `1-9`, never `0`.)
- **`p` pastes the last *thing*, not the last yank.** This is exactly why your config's smart-delete exists: a `dd` on a blank line would clobber the unnamed register with garbage; routing it to `"_` keeps your paste buffer clean.
- **Your yank-stack repurposes `1-9`.** Vanilla vim's numbered registers are *delete* history. Your config cascades them on every yank, so `"1p` = most recent yank, `"2p` = previous. (`:reg` will show you.)
- **Named registers hold text across edits**: `"ay` (yank into `a`), edit freely, `"ap` — your "hold this while I rewrite" tool. Case-insensitive: `"A` appends.
- **Undo (`u`) and registers are independent.** Undo restores buffer text, not registers; registers keep their content after undo.

> **Try this**: `yy` on a line, then `dw` on a word, then `p` (surprise), then `"0p`. Then `"ay` a line, `dd` some stuff, `"ap`. Then `:reg` to see what's where.

### Your config, decoded

- **smart-delete** (`lua/config/keymaps.lua`): blank/whitespace-only `dd x c C X` → `"_…` (black hole), protecting the unnamed register for pasting.
- **yank-stack** (`lua/config/autocmds.lua`): `TextYankPost` + `operator == "y"` → shift registers `9→1`, giving you a yank history on top of vanilla vim's delete history.

Both are "registers are precious, don't let incidental edits destroy them" — now you know *why*.

---

## What's next

- **Lesson 3**: visual mode (the selection interface) + mini.ai's extended text objects (`ii` indent, `ia` argument, `io` block).
- **Lesson 4**: macros — recording `q` into a register and replaying it; the full power of "edit once, replay forever".

Until then: get comfortable with `.` — it should become as reflex as `u` is.
