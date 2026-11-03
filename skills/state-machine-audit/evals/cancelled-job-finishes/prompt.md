---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Find the implicit state machine in this snippet. Jobs have started=False, cancelled=False, done=False, result=None. start() sets started=True; cancel() sets cancelled=True; finish(value) checks started and then stores result=value and done=True without checking cancelled. The documented contract says an accepted cancellation prevents later result acceptance. Review only; do not rewrite it or claim to have run code.
