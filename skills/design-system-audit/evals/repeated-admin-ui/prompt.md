---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Audit this repo for the implicit design-system components hiding in our admin screens. We have a shared UI package already, so tell me what is repeated locally, what should remain domain-specific, and what you'd consolidate first. Read-only; include source evidence and be honest about coverage.

Input files: AGENTS.md, docs/design.md, packages/ui/README.md, packages/ui/src/Button.tsx, apps/admin/routes/users.tsx, apps/admin/routes/audit.tsx
