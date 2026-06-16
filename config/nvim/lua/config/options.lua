-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- Clipboard: cross-platform (macOS, Windows/WSL, Linux)
if vim.fn.has('wsl') == 1 then
  vim.g.clipboard = {
    name = 'WslClipboard',
    copy = {
      ['+'] = 'clip.exe',
      ['*'] = 'clip.exe',
    },
    paste = {
      ['+'] = 'powershell.exe -NoProfile -Command Get-Clipboard',
      ['*'] = 'powershell.exe -NoProfile -Command Get-Clipboard',
    },
    cache_enabled = 0,
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
else
  if vim.fn.executable('wl-copy') == 1 then
    vim.g.clipboard = {
      name = 'WaylandClipboard',
      copy = {
        ['+'] = 'wl-copy',
        ['*'] = 'wl-copy',
      },
      paste = {
        ['+'] = 'wl-paste',
        ['*'] = 'wl-paste',
      },
      cache_enabled = 0,
    }
  elseif vim.fn.executable('xclip') == 1 then
    vim.g.clipboard = {
      name = 'XClipClipboard',
      copy = {
        ['+'] = 'xclip -selection clipboard',
        ['*'] = 'xclip -selection clipboard',
      },
      paste = {
        ['+'] = 'xclip -selection clipboard -o',
        ['*'] = 'xclip -selection clipboard -o',
      },
      cache_enabled = 0,
    }
  end
end
