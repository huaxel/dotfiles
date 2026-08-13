-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- Clipboard: macOS (pbcopy/pbpaste) locally, OSC 52 when SSH'd into this box.
-- OSC 52 rides through any terminal emulator, so copy/paste keeps working
-- over SSH without pbcopy on the remote.
local is_ssh = vim.env.SSH_CONNECTION ~= nil or vim.env.SSH_CLIENT ~= nil or vim.env.SSH_TTY ~= nil
if is_ssh then
  vim.g.clipboard = {
    name = 'OSC 52',
    copy = {
      ['+'] = require('vim.ui.clipboard.osc52').copy '+',
      ['*'] = require('vim.ui.clipboard.osc52').copy '*',
    },
    paste = {
      ['+'] = require('vim.ui.clipboard.osc52').paste '+',
      ['*'] = require('vim.ui.clipboard.osc52').paste '*',
    },
  }
elseif vim.fn.has('mac') == 1 then
  vim.g.clipboard = {
    name = 'MacClipboard',
    copy = {
      ['+'] = 'pbcopy',
      ['*'] = 'pbcopy',
    },
    paste = {
      ['+'] = 'pbpaste',
      ['*'] = 'pbpaste',
    },
    cache_enabled = 0,
  }
end

-- Terminal title: `[host] dir/file` over SSH, `dir/file` otherwise.
-- The icon helper is evaluated lazily on every title refresh, so icon
-- providers (mini.icons) are loaded by the time it actually runs.
vim.o.title = true
local ssh_prefix = is_ssh and ('[' .. vim.fn.hostname() .. '] ') or ''
function _G.nvim_title_icon()
  local name = vim.fn.expand('%:t')
  if name == '' then
    return ''
  end
  local ok, icons = pcall(require, 'mini.icons')
  if ok then
    return icons.get('file', name) .. ' '
  end
  return ''
end
vim.o.titlestring = ssh_prefix .. '%{fnamemodify(getcwd(), ":t")} %{v:lua.nvim_title_icon()}%{expand("%:t")}'
