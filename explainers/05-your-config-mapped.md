# Lesson 5: Your Config, Mapped — The which-key Tour

Sources: verified against your installed LazyVim v16 (`lua/lazyvim/config/keymaps.lua`, `plugins/lsp/init.lua`, `plugins/extras/editor/snacks_picker.lua`, `snacks_explorer.lua`) and your own `lua/plugins/*.lua`. [LazyVim keymaps reference](https://www.lazyvim.org/keymaps).

---

## The discovery skill (the one habit to build)

Your `<leader>` is **space**. Press it once — a popup lists every group. Press one more key — the submenu. Everything below is just the highlights; **the map itself is live, in-editor, always one key away.** You never have to memorize this page; you have to *practice reading the popup*.

---

## The six groups you'll live in

### `f` — find (files & navigation)

| Key | What | When |
|---|---|---|
| `<leader>ff` | find files (root) | your most-pressed key, period |
| `<leader>fg` | find files in git | tracked files only |
| `<leader>fb` | buffers | switch open files |
| `<leader>fr` | recent files | jump back to yesterday's work |
| `<leader>fp` | projects | switch projects |
| `<leader>fT` / `ft` | terminal (cwd/root) | a shell, in a pane |

### `s` — search

| Key | What | When |
|---|---|---|
| `<leader>sg` | grep across the project | "where is this used" |
| `<leader>sw` | word under cursor (or visual selection) | instant "find usages", no typing |
| `<leader>sb` | lines in current buffer | jump within a long file |
| `<leader>sd` | all diagnostics | errors across the project |
| `<leader>ss` | LSP symbols | jump to a function/class by name |
| `<leader>st` | TODO/FIXME list | your own breadcrumbs |
| `<leader>sk` | keymaps | search any key binding |

### `g` — git

| Key | What |
|---|---|
| `<leader>gg` | lazygit — the full git UI (staging, commits, branches, rebase) |
| `<leader>gd` | diffview open — side-by-side diff of working changes |
| `<leader>gh` | file history — the file's commit history in diffview |
| `<leader>gb` | blame the current line |
| `<leader>gl` | git log |
| `<leader>gB` | open current file/selection on the remote (GitHub) |

### `c` — code (LSP, cursor in a file)

| Key | What | The IDE-equivalent |
|---|---|---|
| `gd` | go to definition | Ctrl+Click / F12 |
| `gD` | declaration | |
| `gr` | references | Shift+F12 |
| `gI` | implementation | |
| `K` | hover docs | |
| `gK` | signature help | Ctrl+Shift+Space |
| `<leader>cr` | rename | F2 |
| `<leader>ca` | code actions | the lightbulb |
| `<leader>co` | organize imports | |
| `<leader>cc` | run codelens | |
| `<leader>cl` | LSP info (which server, status) | |

### `u` — toggles (settings you flip mid-session)

`<leader>uf` format on save · `uw` wrap · `us` spell · `ub` dark/light · `ud` diagnostics · `ul` line numbers · `uZ` zen · `um` zoom

### `x` — diagnostics & quickfix

`<leader>xl` line diagnostics · `xq` quickfix list · `xd` diagnostic float

---

## Windows, buffers, and the everyday

| Key | What |
|---|---|
| `<leader>-` / `|` | split below / right |
| `<leader>wd` | close the split |
| `<leader>bb` | switch to other buffer |
| `<leader>bd` | close buffer |
| `<leader>qq` | quit everything |
| `<leader>e` | explorer (file tree, snacks) |

## Your personal keys (the ones you added)

| Key | What | Where |
|---|---|---|
| `<leader>aa` | toggle AI chat (codecompanion) | your `plugins/codecompanion.lua` |
| `<leader>gg` | lazygit | your `plugins/lazygit.lua` |
| `<leader>gd` / `gD` / `gh` | diffview open / close / history | your `plugins/lazygit.lua` |
| `<leader>cs` | outline (symbol tree) — *you remapped this from trouble* | your `plugins/outline.lua` |

---

## The one mental model

**`f` and `s` = where things are. `g` = git. `c` = code intelligence. `u` = settings.** Everything else is detail you'll absorb by pressing space and *reading the popup*.

> **Try this**: open nvim, press space, and read the popup top to bottom. Then `f` → read the submenu → actually run `ff`, `fr`, `fb`. Then `s` → run `sg` and grep for a function name. Then in a C# file: `gd`, `gr`, `<leader>cr` (rename), `K`. Ten minutes of this is worth more than re-reading this page.

---

## What's next

- **Lesson 6**: the LSP/format/test loop — how a `.cs` file turns on OmniSharp, format-on-save, and neotest/dap for your C# workflow.
- **Lesson 7**: git workflow end-to-end — lazygit + diffview in practice.
