-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")
vim.g.python3_host_prog = vim.fn.expand("~/.neovim-venv/bin/python")
