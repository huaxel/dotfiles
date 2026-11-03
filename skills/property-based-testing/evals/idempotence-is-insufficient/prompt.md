---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

I want property-based tests for a Unicode normalizer. My test checks normalize(normalize(s)) == normalize(s), but the implementation returning an empty string passes it. Explain what to add and how to generate useful inputs. We already use Hypothesis. Do not write files.
