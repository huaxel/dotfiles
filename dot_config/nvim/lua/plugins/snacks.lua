-- snacks.nvim configuration
-- Note: notifier, indent, input, scroll, words are enabled by default in LazyVim
return {
  {
    "folke/snacks.nvim",
    opts = {
      -- These are enabled by default in LazyVim, but you can customize here:
      -- notifier = { enabled = true },
      -- indent = { enabled = true },
      -- input = { enabled = true },
      -- scroll = { enabled = true },
      -- scope = { enabled = true },
      -- words = { enabled = true },
    },
    keys = {
      {
        "<leader>n",
        function()
          if Snacks.config.picker and Snacks.config.picker.enabled then
            Snacks.picker.notifications()
          else
            Snacks.notifier.show_history()
          end
        end,
        desc = "Notification History",
      },
      { "<leader>un", function() Snacks.notifier.hide() end, desc = "Dismiss All Notifications" },
    },
  },
}
