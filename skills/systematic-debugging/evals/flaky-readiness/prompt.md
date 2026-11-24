---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

A test waits 100ms for a worker to become ready and then checks output. It passes alone but fails in CI under parallel load. A previous agent raised the sleep to 500ms and suggested dumping the environment. Review that approach and propose the next diagnostic step; do not change files.
