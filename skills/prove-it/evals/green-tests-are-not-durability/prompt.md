---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Give me irrefutable proof that our refund workflow works. The only evidence attached is: 200 unit tests passed, all payment calls mocked, HTTP handler returned 200. We promise refunds survive a crash without paying twice. Analyze what this establishes and specify the missing executable check; do not access production or claim tests you cannot run.
