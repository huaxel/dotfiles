# Lesson 1: The Grammar of Vim — Operators, Motions, Text Objects

Sources: [Vim user manual ch. 3 — motions](https://vimhelp.org/usr_03.txt.html) · [ch. 4 — small changes](https://vimhelp.org/usr_04.txt.html) · [motion.txt](https://vimhelp.org/motion.txt.html) · [Practical Vim (Drew Neil)](https://www.goodreads.com/book/show/13607232-practical-vim)

---

## The one idea

Vim's normal mode is a **language**, not a list of shortcuts. Every edit is a short **sentence**:

```
operator (verb)  +  motion / text object (noun)   =  an edit
```

- `d` + `w` = `dw` → **d**elete a **w**ord
- `c` + `i"` = `ci"` → **c**hange **i**nside **"**quotes"
- `y` + `a}` = `ya}` → **y**ank **a**round **}**braces

Because verbs and nouns compose freely, ~10 verbs × ~25 nouns = hundreds of edits you never memorize — you *build* them. This is the "Vim way" Practical Vim is built around: [composable, not memorized](https://blog.tomasino.org/review-practical-vim-edit-text-at-the-speed-of-thought/).

> **Try this** — open any file and press `dw` on a word. Then `d$` at a line's start (deletes to end of line). Then `dG` (deletes everything to the bottom of the file — careful, in a scratch buffer!). Same verb, different noun, three different edits.

## The verbs (operators)

| Key | Verb | Meaning |
|---|---|---|
| `d` | delete | cut into the register (paste with `p`) |
| `c` | change | delete **and** enter insert mode — "replace this" |
| `y` | yank | copy |
| `p` / `P` | put | paste after / before cursor |
| `g~` | swap case | `g~w` flips a word's case |
| `gu` / `gU` | lowercase / uppercase | `gUiw` uppercases a word |
| `>` / `<` | indent / outdent | `>>` indents a line |
| `=` | format | `=i{` reformats a code block |

`c` is the most useful: it's `d` + straight into insert mode. "Change this" is the edit you'll type most.

> **Try this**: `ciw` (change inner word), type a replacement, `<Esc>`. Then `c$` and type. Feel how `c` = "replace up to the noun".

## The nouns I — motions (movement)

| Kind | Keys | Meaning |
|---|---|---|
| Word | `w` `e` `b` | next word **s**tart, word **e**nd, back word start |
| Line | `0` `^` `$` | line start, first non-blank, line end |
| Character | `f{` `t{` `F{` `T{` | **f**ind char on line, **t**ill before it, backwards |
| Block | `h` `j` `k` `l` | left / down / up / right |
| File | `gg` `G` `{n}G` | top, bottom, line n |
| Paragraph | `{` `}` | up/down a blank-line block |
| Search | `/pattern` `n` `N` | search, next, previous |
| Match | `%` | jump to the matching bracket/`(/)`/`{/}` |

Motions are also your travel keys: `w` alone moves you; `dw` deletes the word you'd land on.

> **Try this**: on a line like `const x = foo(bar, baz);`, press `f(` then `%` — you jump between parens. Then `dw` after `const `, then `d$`.

## The nouns II — text objects (the secret weapon)

Motions move *to* text. Text objects select text **by structure** — the cursor just has to be *inside* the thing, not at its edge. This is what makes vim feel like an IDE.

| Object | Meaning | | Object | Meaning |
|---|---|---|---|---|
| `iw` / `aw` | **i**nner **w**ord / **a**round (incl. space) | | `i{` / `a{` | inside / around braces `{}` |
| `i"` / `a"` | inside / around `"quotes"` | | `i(` / `a(` | inside / around parens |
| `i'` / `a'` | single quotes | | `i[` / `a[` | square brackets |
| `i` / `a`` | backticks | | `it` / `at` | inside / around a `<tag>…</tag>` |

`i` = just the content. `a` = the content **and** its delimiters (plus trailing whitespace for `aw`).

Your config already ships **mini.ai**, which adds more objects out of the box: `ii` (indent block), `ia` (function argument), `io` (block) — we'll drill those in a later lesson.

> **Try this** — cursor anywhere inside `foo("hello")`:
> - `ci"` → change `hello`, type `world`, `<Esc>` → `foo("world")`
> - `di(` → deletes `"world"` (content), leaves `foo()`
> - `da(` → deletes `foo(...)` *including* the parens
> Same two keys, three different results — that's the power.

## Numbers multiply sentences

A count before a verb or noun repeats it: `3dd` = delete 3 lines, `d3w` = delete 3 words, `2ciw` = change 2 words.

> **Try this**: `3dd` on a line, then `u` to undo, then `d3w`.

## The golden compositions

| Edit | Keys | Why it's golden |
|---|---|---|
| Replace the word under cursor | `ciw` | works anywhere in the word — most-used edit in vim |
| Delete a whole line, anywhere on it | `dd` | vs. dragging to the start first |
| Rewrite a function call's arguments | `ci(` | change inside parens |
| Delete a quoted string | `di"` | cursor can be mid-string |
| Uppercase a word | `gUiw` | |
| Delete from a brace to its match | `d%` | cursor on `{`, kills the whole block in one |

## What's next

- **Lesson 2**: the `.` command (repeat the last edit) and the register system (`"1p`, yank stack) — how your smart-delete and yank-stack features actually work under the hood.
- **Lesson 3**: visual mode + mini.ai's extended objects.

Until then, the single habit that compounds: **whenever you reach for the mouse or arrow keys to fix something, stop and ask "what's the verb + noun?"** Look it up once, use it forever.
