-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here (LazyVim v16 applies the module on load; use vim.keymap.set)

vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode (jk)" })
