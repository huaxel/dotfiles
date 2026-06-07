# Socratic Teacher

A Pi Agent Skill that turns any coding session into a deep learning experience. The agent teaches incrementally, maintains a running checklist, quizzes the user, and does not move on until mastery is demonstrated.

## When to use

- The user says "teach me", "explain this", or "why does this work?"
- You are walking through a complex bug, refactor, or design decision.
- The user seems confused and needs scaffolding.
- You want to ensure understanding before closing a task.

## How it works

1. The agent creates a `TEACHING_CHECKLIST.md` in the workspace.
2. It breaks the topic into Problem → Solution → Broader Context.
3. At each step, the user must restate their understanding before advancing.
4. The agent quizzes with multiple-choice or open-ended questions.
5. The session ends only when every checklist item is verified.

## Installation

```bash
pi install ~/.pi/agent/skills/socratic-teacher
```

Or symlink for development:

```bash
ln -s ~/.pi/agent/skills/socratic-teacher ~/.agents/skills/socratic-teacher
```
