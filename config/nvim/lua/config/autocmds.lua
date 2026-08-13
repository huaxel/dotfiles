-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- Large-file guard: keep huge buffers (logs, dumps, generated files) snappy by
-- dropping syntax/plugin-heavy features. `vim.b.large_file` lets plugins opt out too.
local augroup = vim.api.nvim_create_augroup("LargeFile", { clear = true })
vim.api.nvim_create_autocmd({ "BufReadPre", "FileReadPre" }, {
  group = augroup,
  callback = function()
    local path = vim.fn.expand("%:p")
    if path ~= "" and vim.fn.getfsize(path) > 2 * 1024 * 1024 then
      vim.b.large_file = true
      vim.opt_local.foldmethod = "manual"
      vim.opt_local.spell = false
      vim.opt_local.matchpairs = ""
      vim.opt_local.syntax = "off"
      vim.opt_local.treesitter_highlight = false
    end
  end,
})

-- Yank stack (from dmtrKovalenko's config): on every yank, cascade the
-- numbered registers (1→2, 2→3, …, 9→0-1), so `"1p` is always the most recent
-- yank, `"2p` the one before, and so on — a poor man's yank history that
-- composes with yanky's ring.
local function yank_shift()
  for i = 9, 1, -1 do
    vim.fn.setreg(tostring(i), vim.fn.getreg(tostring(i - 1)))
  end
end

vim.api.nvim_create_autocmd("TextYankPost", {
  callback = function()
    if vim.v.event.operator == "y" then
      yank_shift()
    end
  end,
})
