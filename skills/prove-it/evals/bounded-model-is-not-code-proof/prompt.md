---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Our model checker explored two workers and three retries without a counterexample. We modeled publish() as one atomic operation, but the real code updates a pointer and then writes a catalog entry separately. Give me proof this release mechanism is correct, using only this evidence. No new execution is available.
