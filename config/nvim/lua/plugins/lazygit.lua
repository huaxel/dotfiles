return {
  {
    "kdheepak/lazygit.nvim",
    cmd = {
      "LazyGit",
      "LazyGitConfig",
      "LazyGitCurrentFile",
      "LazyGitFilter",
      "LazyGitFilterCurrentFile",
    },
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    keys = {
      { "<leader>gg", "<cmd>LazyGit<cr>", desc = "LazyGit" },
      { "<leader>gf", "<cmd>LazyGitCurrentFile<cr>", desc = "LazyGit (current file)" },
    },
  },
  {
    "sindrets/diffview.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    cmd = {
      "DiffviewOpen",
      "DiffviewClose",
      "DiffviewToggleFiles",
      "DiffviewFocusFiles",
      "DiffviewFileHistory",
    },
    keys = {
      { "<leader>gd", "<cmd>DiffviewOpen<cr>", desc = "Diffview Open" },
      { "<leader>gD", "<cmd>DiffviewClose<cr>", desc = "Diffview Close" },
      { "<leader>gh", "<cmd>DiffviewFileHistory<cr>", desc = "File History" },
    },
    opts = {
      diff_binaries = false,
      enhanced_diff_hl = false,
      git_cmd = { "git" },
      use_icons = true,
      view = {
        default = {
          layout = "diff2_horizontal",
          win_config = {},
        },
        merge_tool = {
          layout = "diff3_horizontal",
          disable_diagnostics = true,
          win_config = {},
        },
        file_history = {
          layout = "diff2_horizontal",
          win_config = {},
        },
      },
      file_panel = {
        listing_style = "tree",
        tree_options = {
          flatten_dirs = true,
          folder_statuses = "only_folded",
        },
        win_config = {
          position = "left",
          width = 35,
          win_opts = {},
        },
      },
      file_history_panel = {
        log_options = {
          git = {
            single_file = {
              diff_merges = "combined",
            },
            multi_file = {
              diff_merges = "first-parent",
            },
          },
        },
        win_config = {
          position = "bottom",
          height = 16,
          win_opts = {},
        },
      },
      commit_log_panel = {
        win_config = {},
      },
      default_args = {
        DiffviewOpen = {},
        DiffviewFileHistory = {},
      },
      hooks = {
        diff_buf_read = function(bufnr)
          -- Optional: set keymaps for diff buffers
        end,
      },
      keymaps = {
        disable_defaults = false,
        view = {
          ["<tab>"] = "select_next_entry",
          ["<s-tab>"] = "select_prev_entry",
          ["gf"] = "goto_file",
          ["<C-w><C-f>"] = "goto_file_split",
          ["<C-w>gf"] = "goto_file_tab",
          ["<leader>e"] = "focus_files",
          ["<leader>b"] = "toggle_files",
        },
        file_panel = {
          ["j"] = "next_entry",
          ["k"] = "prev_entry",
          ["o"] = "select_entry",
          ["<2-LeftMouse>"] = "select_entry",
          ["-"] = "toggle_stage_entry",
          ["S"] = "stage_all",
          ["U"] = "unstage_all",
          ["X"] = "restore_entry",
          ["R"] = "refresh_files",
          ["<tab>"] = "select_next_entry",
          ["<s-tab>"] = "select_prev_entry",
          ["gf"] = "goto_file",
          ["<C-w><C-f>"] = "goto_file_split",
          ["<C-w>gf"] = "goto_file_tab",
          ["i"] = "listing_style",
          ["f"] = "toggle_flatten_dirs",
          ["<leader>e"] = "focus_files",
          ["<leader>b"] = "toggle_files",
        },
        file_history_panel = {
          ["g!"] = "options",
          ["<C-A-d>"] = "open_in_diffview",
          ["y"] = "copy_hash",
          ["L"] = "options",
          ["<leader>e"] = "focus_files",
          ["<leader>b"] = "toggle_files",
        },
        option_panel = {
          ["<tab>"] = "select",
          ["q"] = "close",
        },
      },
    },
  },
}
