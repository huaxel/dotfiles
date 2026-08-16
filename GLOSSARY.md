# Vim/Neovim Glossary

The canonical language for this teaching workspace. Terms are added only once the user demonstrates they understand them; definitions are compressed, opinionated, and used everywhere in explainers and learning records. Definitions use this glossary's own terms where possible.

## Terms

**mode**:
A distinct keyboard behavior of the editor. Normal mode reads commands; insert mode types text; visual mode selects text; command-line mode runs `:` commands.
_Avoid_: state, screen, "the vim thing"

**operator**:
A normal-mode verb that acts on the motion or text object that follows it — `d` delete, `c` change, `y` yank, `gU` uppercase.
_Avoid_: command, function, action

**motion**:
A normal-mode noun that moves the cursor, and the target for an operator — `w` next word, `$` end of line, `f{` find character, `%` matching bracket.
_Avoid_: navigation, jump, movement

**text object**:
A noun selecting text by *structure* rather than by movement — `iw` inner word, `i"` inside quotes, `i(` inside parens, `it` inside tag. Works regardless of cursor position within the text.
_Avoid_: selection, range, block

**count**:
A number before an operator or motion that repeats it — `3dd` deletes 3 lines, `d3w` deletes 3 words. Can attach to either side: `3dd` ≡ `d2j`.
_Avoid_: multiplier, number prefix

**dot command**:
`.`, which repeats the last change — including any typed text — so `ciw`+`foo` then `.` replaces the next word with `foo`. The single highest-leverage command in vim.
_Avoid_: redo, repeat key

**register**:
A named slot storing yanked/deleted text — `"` unnamed (what `p` pastes), `0` last yank only, `1`–`9` history (yank history in this config via the yank-stack), `a`–`z` manual, `_` black hole (stores nothing).
_Avoid_: clipboard slot, buffer copy

**visual mode**:
A mode for selecting text with the cursor — `v` characters, `V` lines, `<C-v>` block columns — so operators and ex commands act on the selection. `gv` re-selects the last one.
_Avoid_: selection mode, highlighting mode

**macro**:
A recorded sequence of normal-mode commands stored in a register — `qa` records into register `a`, `@a` replays, `5@a` replays five times. The automation layer on top of the operator/noun grammar.
_Avoid_: script, recording
