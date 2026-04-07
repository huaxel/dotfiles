-- Conform formatter configuration
-- Only specify formatters for your languages; LazyVim handles the rest
return {
  {
    "stevearc/conform.nvim",
    optional = true,
    opts = {
      formatters_by_ft = {
        -- Juan's language stack: Python, PHP, JS/TS
        python = { "ruff_fix" },
        javascript = { "prettier" },
        javascriptreact = { "prettier" },
        typescript = { "prettier" },
        typescriptreact = { "prettier" },
        css = { "prettier" },
        scss = { "prettier" },
        html = { "prettier" },
        json = { "prettier" },
        yaml = { "prettier" },
        markdown = { "prettier" },
        php = { "php-cs-fixer" },
        sql = { "sqlfluff" },
      },
    },
  },
}
