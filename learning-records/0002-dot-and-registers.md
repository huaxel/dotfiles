# LR-0002: The dot command and registers (demonstrated)

User aced the Lesson 2 quiz (5/5): `.` repeating a whole `ciw`+typed-text change, counting `dd` + `.` ×2 = 3 lines, recovering a clobbered paste with `"0p` (register 0 is yanks-only), reading the config's yank-stack correctly (`"2p` = second-most-recent yank), and the `"_dd` black-hole delete.

Evidence: quiz answers 1b 2b 3b 4b 5b.

Implications: the user now understands their own config's smart-delete and yank-stack at the *mechanism* level (registers are precious, don't let incidental edits destroy them) — a direct hit on the mission's "understand my config" half. Next: visual mode + mini.ai extended objects (lesson 3), then macros (lesson 4) closes the core-grammar arc, after which sessions pivot to the LazyVim keymap/plugin layer.
