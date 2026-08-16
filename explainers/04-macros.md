# Lesson 4: Macros — Record Once, Replay Forever

Sources: [Vim user manual ch. 10 — making big changes](https://vimhelp.org/usr_10.txt.html) · [Practical Vim (Drew Neil)](https://www.goodreads.com/book/show/13607232-practical-vim)

---

## The idea

A macro is **a recorded sequence of normal-mode commands stored in a register** — your most complex edit, replayable with two keys. Where `.` repeats the *last* change, a macro repeats a *whole multi-step* sequence.

## The mechanics

```
qa     → start recording into register a  (status line shows "recording")
<do the edit>
j      → the crucial last step: advance to the next target line
q      → stop recording
@a     → replay once
3@a    → replay three times
@@     → repeat the last-used macro
```

## The pattern that makes macros powerful

1. **Do the edit manually once**, confirm it's right, `u` to undo.
2. **Record it for real** — `qa`, same edit, then *advance* (`j` or `0j`) as the final step so the replay lands on the next target, `q`.
3. **Replay** — `@a`, and if the line ends (no more targets), the macro just fails silently — safe.

### Run a macro on many lines at once

```
:'<,'>normal @a    → on a visual selection
:%normal @a        → on every line of the file
```

## Macros are just text

A macro is stored in a register, and registers hold text — so you can inspect and edit them:

- `"ap` — paste macro `a` as text into the buffer
- edit it like any text
- `"ay` — yank it back into register `a`

`qA` (capital) appends to an existing macro instead of overwriting.

## `.` vs `@a` — when to use which

| Tool | Use for |
|---|---|
| `.` | the same *single* edit again, once or a few times |
| macro | a *sequence* of edits repeated many times, or something you'll do again later |

## The one habit that unlocks everything

Rehearse once manually, then record. A macro you can't predict is a bug you're about to replay ten times.

> **Try this** — a list of names, one per line: record `qa` → `A,` (append comma) → `j` → `q`, then `5@a`. Then undo and edit the macro: `"ap`, fix something, `"ay`, replay.

## Where this lands you

That's the core grammar complete:

- **Lesson 1**: operators + motions + text objects (the language)
- **Lesson 2**: `.` and registers (the memory)
- **Lesson 3**: visual mode + treesitter objects (the selection)
- **Lesson 4**: macros (the automation)

Next session pivots to **your config**: the which-key map, LSP/format/test workflow, git — the "understand my nvim" half of the mission.
