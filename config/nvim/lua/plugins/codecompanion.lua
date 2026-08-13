return {
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    -- lazyvim-style opts
    opts = {
      adapters = {
        acp = {
          -- pi via the pi-acp bridge (https://github.com/svkozak/pi-acp)
          -- pi-acp speaks ACP over stdio and spawns `pi --mode rpc`
          pi = function()
            return require("codecompanion.adapters").extend("codex", {
              name = "pi",
              formatted_name = "pi",
              commands = { default = { "pi-acp" } },
              defaults = {
                -- codex defaults to "api-key", but pi-acp only advertises
                -- "pi_terminal_login" (a no-op terminal auth). Setting this
                -- avoids the "Auth method api-key is not advertised" error.
                auth_method = "pi_terminal_login",
              },
              env = {},
            })
          end,
        },
      },
      interactions = {
        chat = { adapter = "pi" },
        inline = { adapter = "pi" },
      },
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
