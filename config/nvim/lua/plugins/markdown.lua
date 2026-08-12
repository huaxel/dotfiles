-- Markdownlint global configuration
--
-- Wires a global markdownlint config file (~/.config/markdownlint/.markdownlint-cli2.yaml)
-- into BOTH the nvim-lint linter (diagnostics) and the conform formatter (--fix),
-- so the same relaxed rules apply everywhere.
--
-- Per-project .markdownlint-cli2.* files still override the global defaults.
-- See: ~/dotfiles/config/markdownlint/.markdownlint-cli2.yaml

local config_dir = vim.fn.fnamemodify(vim.fn.stdpath("config"), ":h") -- ~/.config
local global_config = config_dir .. "/markdownlint/.markdownlint-cli2.yaml"
local has_config = vim.fn.filereadable(global_config) == 1

local markdownlint_args = has_config and { "--config", global_config } or {}

return {
  {
    "stevearc/conform.nvim",
    optional = true,
    opts = {
      formatters = {
        ["markdownlint-cli2"] = {
          prepend_args = markdownlint_args,
        },
      },
    },
  },
  {
    "mfussenegger/nvim-lint",
    optional = true,
    opts = {
      linters = {
        ["markdownlint-cli2"] = {
          prepend_args = markdownlint_args,
        },
      },
    },
  },
  {
    -- LazyVim's Markdown extra enables this by default; use Markview instead.
    "MeanderingProgrammer/render-markdown.nvim",
    enabled = false,
  },
  {
    "OXY2DEV/markview.nvim",
    ft = { "markdown", "mdx" },
    init = function()
      local function quiet_markdown_highlights()
        local function foreground(group)
          return vim.api.nvim_get_hl(0, { name = group, link = false }).fg
        end

        local normal_fg = foreground("Normal")
        local heading_groups = { "Title", "Constant", "Keyword", "Identifier", "String", "Comment" }
        for level, group in ipairs(heading_groups) do
          local heading = "@markup.heading." .. level .. ".markdown"
          vim.api.nvim_set_hl(0, heading, {
            fg = foreground(group) or normal_fg,
            bold = true,
          })
        end

        local code_fg = foreground("Identifier") or normal_fg
        vim.api.nvim_set_hl(0, "MarkdownInlineCode", { fg = code_fg })
        for _, name in ipairs({
          "@markup.raw.inline",
          "@markup.raw.inline.markdown",
          "@markup.raw.inline.markdown_inline",
        }) do
          vim.api.nvim_set_hl(0, name, { fg = code_fg })
        end
      end

      vim.api.nvim_create_autocmd("ColorScheme", {
        callback = quiet_markdown_highlights,
      })
      vim.api.nvim_create_autocmd("FileType", {
        pattern = { "markdown", "mdx" },
        callback = function(args)
          quiet_markdown_highlights()
          -- Keep lint results available, but do not draw distracting squiggles.
          vim.opt_local.spell = false
          vim.diagnostic.enable(false, { bufnr = args.buf })
        end,
      })
      vim.schedule(quiet_markdown_highlights)
    end,
    dependencies = {
      {
        "gunasekar/markview-smart-tables.nvim",
        opts = {
          -- Fit wide tables to the current window and wrap cell contents.
          wrap_width = 0.9,
          wrap_minwidth = 8,
        },
        config = function(_, opts)
          require("markview-smart-tables").setup(opts)
        end,
      },
    },
    opts = function()
      local presets = require("markview.presets")
      local quiet_border = "Comment"
      local table_hl = {
        top = { quiet_border, quiet_border, quiet_border, quiet_border },
        header = { quiet_border, quiet_border, quiet_border },
        separator = { quiet_border, quiet_border, quiet_border, quiet_border },
        row = { quiet_border, quiet_border, quiet_border },
        bottom = { quiet_border, quiet_border, quiet_border, quiet_border },
        overlap = { quiet_border, quiet_border, quiet_border, quiet_border },
        align_left = quiet_border,
        align_right = quiet_border,
        align_center = { quiet_border, quiet_border },
      }

      return {
        -- Reveal raw Markdown only while editing; keep the preview clean in normal mode.
        preview = {
          hybrid_modes = { "i" },
        },
        markdown = {
          -- Keep headings, rules, quotes, and code blocks close to normal Markdown.
          headings = { enable = false },
          horizontal_rules = { enable = false },
          block_quotes = { enable = false },
          code_blocks = { sign = false, style = "simple", min_width = 0 },
          list_items = {
            marker_minus = { text = "•", hl = "@markup.list.markdown" },
            marker_plus = { text = "+", hl = "@markup.list.markdown" },
            marker_star = { text = "*", hl = "@markup.list.markdown" },
          },
          tables = {
            -- Keep borders, but use a single quiet color instead of palette colors.
            parts = presets.tables.single.parts,
            hl = table_hl,
          },
        },
        markdown_inline = {
          checkboxes = { enable = false },
          inline_codes = {
            enable = true,
            padding_left = "",
            padding_right = "",
            hl = "MarkdownInlineCode",
          },
          hyperlinks = { default = { icon = "", hl = "Underlined" } },
          internal_links = { default = { icon = "", hl = "Underlined" } },
          uri_autolinks = { default = { icon = "", hl = "Underlined" } },
        },
        renderers = {
          markdown_table = function(buffer, item)
            require("markview-smart-tables").render(buffer, item)
          end,
        },
      }
    end,
  },
}
