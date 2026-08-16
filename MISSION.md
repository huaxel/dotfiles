# Mission: Using my Neovim (LazyVim) properly

## Why
I'm coming from IDE-style tools (VS Code workflows) and now run a LazyVim config with 65 plugins I mostly don't understand. I want to reach the point where editing with vim is *faster* than my old tools **and** I know what each part of my config does — so the editor is a tool I command, not a mystery I tolerate.

## Success looks like
- Compose edits with operators + motions + text objects without looking keys up — delete/change/move things in 1–3 keystrokes I build, not memorized macros
- Use the `.` repeat, registers, and macros fluently in daily C#/Python/TS/SQL work
- Know what every which-key menu entry does and why; maintain/curate my config without fear (add a plugin, prune an extra)
- Run tests, debugging, formatting, and LSP features from nvim as fast as in my IDE

## Constraints
- Beginner: started vim recently (`jk`→Esc is the only custom keymap so far)
- Base: LazyVim v16 pinned to stable; macOS locally, SSH remote (OSC 52 clipboard, SSH title)
- Stack: C#, Python, PHP, TypeScript, SQL, Docker, Markdown
- Delivery: markdown explainers in this workspace + in-agent quizzes with immediate feedback
- Learning style: barebones-then-add — I learn by understanding each piece's purpose
- Sessions: whenever I'm here; no strict time budget

## Out of scope
- Hand-rolling a full config from scratch right now (may revisit after fundamentals are solid)
- Plugin authoring / writing Lua for plugins
- Neovim internals (the API, writing treesitter queries)
- Vim trivia / configuration tricks with no payoff for my work
