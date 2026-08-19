# Pi Document Workspace

This directory is the design and development home for the document-first coding-agent workflow currently prototyped by the `worksheet-loop` extension.

## Vision

Make a shared Markdown document the durable collaboration surface between a human and Pi:

- the human adds goals, constraints, questions, todos, and feedback;
- Pi researches, reviews, implements, and records findings, decisions, and progress;
- saved document revisions steer Pi without requiring a second copy-pasted prompt;
- the terminal remains an execution, status, error, and interruption view rather than a duplicate conversation.

This is deliberately editor-agnostic. Obsidian, Neovim, Zed, or any Markdown editor can participate.

## Current implementation

- Extension: `pi/agent/extensions/worksheet-loop.ts`
- Skill: `pi/agent/skills/worksheet-loop/SKILL.md`
- Runtime documents: project-local `.worksheets/*.md`
- Active design worksheet: `.worksheets/ws-1787175334-worksheet-plan.md`

Useful commands:

```text
/worksheet start <slug>
/worksheet attach path/to/document.md
/worksheet list
/worksheet search <text>
/worksheet open [name]
/worksheet status
/worksheet pause
/worksheet resume
```

## Documents in this directory

- `DESIGN.md` — interaction model, protocol, and UX principles
- `ROADMAP.md` — implementation milestones and next work
- `DECISIONS.md` — durable design decisions and rejected alternatives
- `AGENTS.md` — instructions for future sessions working in this directory

Read those files before making changes here. Update the roadmap and decisions as the design evolves.
