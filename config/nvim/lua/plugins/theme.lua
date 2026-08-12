return {
  -- TokyoNight is the only configured theme; do not install LazyVim's fallback.
  { "catppuccin/nvim", enabled = false },
  {
    "folke/tokyonight.nvim",
    opts = {
      transparent = true,
      styles = {
        sidebars = "transparent",
        floats = "transparent",
      },
    },
  },
}
