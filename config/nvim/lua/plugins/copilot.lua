-- Copilot is fully disabled (suggestions + blink integration).
--
-- Re-enable:
--   1. remove the `enabled = false` lines below
--   2. re-add "lazyvim.plugins.extras.ai.copilot" to lazyvim.json
--   3. restart nvim (running copilot agents die with their session)
return {
  { "zbirenbaum/copilot.lua", enabled = false },
  { "fang2hou/blink-copilot", enabled = false },
}
