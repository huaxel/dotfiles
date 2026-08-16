# LR-0003: Visual mode + mini.ai objects (demonstrated); brace-vs-treesitter misconception corrected

User scored 4/5 on Lesson 3: visual mode (`V2j>` line selection + indent, `<C-v>` block insert, `gv` re-select) and the mini.ai argument object (`cia` from the space before the argument) are correct.

Misconception corrected: chose `ci{` over `cif` for "replace the whole 40-line method body". `ci{` selects the *nearest enclosing* brace pair — an inner `if`/`for` block when the cursor is nested inside one — while `cif` (treesitter function object) selects the whole function body regardless of cursor position. Lesson distilled: char-based text objects match "nearest structure", treesitter objects match "semantics"; the config ships treesitter objects for exactly this reason.

Evidence: quiz answers 1a 2a 3c 4a(wrong) 5b, corrected in feedback.

Implications: predicts future stumbling blocks with char-based objects in nested structures (e.g., `di(` inside nested parens) — reinforce when nested selection comes up. Treesitter vs char-based objects are now distinguished in the user's mental model. Next: macros (lesson 4) closes the core-grammar arc; then sessions pivot to the config layer (which-key map, LSP workflow, git).
