---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

I inspected only the job-controller file in a large app and drew a diagram showing claim → complete as one atomic transition. In reality it writes the database and sends a queue message separately. Can we say we found all the implicit state machines and proved completion is atomic? Assess those claims; no code changes.
