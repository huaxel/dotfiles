---
description: Full implementation workflow - scout gathers context, planner creates plan, worker implements
---

Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to investigate the codebase and gather context for: $@
2. Then, use the "planner" agent to create an implementation plan based on the scout's findings (use {previous} placeholder)
3. Finally, use the "worker" agent to implement the plan from the previous step (use {previous} placeholder)
