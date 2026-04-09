return {
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    -- lazyvim-style opts
    opts = {
      -- use Copilot adapter (already configured via copilot.lua)
      -- if you want a different adapter, add it here:
      -- interactions = { chat = { adapter = "openai" }, inline = { adapter = "openai" } },
      opts = {
        log_level = "INFO",
      },
    },
    -- load keymaps
    keys = {
      { "<C-a>", "<cmd>CodeCompanionActions<cr>", desc = "CodeCompanion Actions" },
      { "<leader>aa", "<cmd>CodeCompanionChat Toggle<cr>", desc = "Toggle AI Chat" },
      { "ga", "<cmd>CodeCompanionChat Add<cr>", mode = "v", desc = "Add selection to chat" },
    },
  },
}
