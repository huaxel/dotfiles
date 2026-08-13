-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here (LazyVim v16 applies the module on load; use vim.keymap.set)

vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode (jk)" })

-- Smart delete (borrowed from dmtrKovalenko's config): `dd`, `x`, `c`, `C`, `X`
-- on an empty or whitespace-only line go to the black hole register, so the
-- unnamed register keeps your last real delete/yank. `d` is expr-mapped too:
-- with a following motion it resolves to native `d` unless the cursor sits on
-- a blank line. `s`/`S` are skipped — LazyVim uses them for flash.
local function smart_delete(key)
  local l = vim.api.nvim_win_get_cursor(0)[1]
  local line = vim.api.nvim_buf_get_lines(0, l - 1, l, true)[1]
  return (line:match("^%s*$") and '"_' or "") .. key
end

for _, key in ipairs({ "d", "dd", "x", "c", "C", "X" }) do
  vim.keymap.set("n", key, function()
    return smart_delete(key)
  end, { noremap = true, expr = true, desc = "Smart delete" })
end
