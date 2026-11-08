---
name: Routine healthcheck
description: >-
  Use when auditing the Grok Bot fleet's routines for usage waste: too frequent,
  noisy empty runs, dead or duplicate routines, routines on long chats, or
  mechanical work a box script could gate.
---
# Routine healthcheck

Goal: spot routines that burn usage for little value, and suggest fixes. Suggest only. Never edit another bot's routines unless the user says so.

## Sources
- Usage: `CheckSubscriptionUsage` (cursor namespace) with `breakdown: ["bot","routine"]`, `period: "last_7_days"`, `limit: 10`. This gives each bot's and routine's share of usage. Read the Cursor-managed `usage-review` skill before interpreting it, and report shares in its words.
- Your own routines: the latest automation_status reminder, and `UpdateRoutine` get for saved prompt and schedule.
- Other bots' routines are not readable from here. Infer them from `ReadTranscript` with `in` = that bot's id: routine wakes show up as runs in its transcript. Read the last 7 days.
- Existing gate scripts: `/workspace/bin/GATES.md` if present.
- There are no routine folders or transcript folders on disk to read.

## Flags
- **too frequent**: runs more often than its output is useful (e.g. hourly with daily-value output)
- **off-hours**: runs on weekends or overnight when nothing it watches happens then and nobody acts on it then
- **noisy empty**: most runs find nothing yet still send a message, or run long to conclude nothing
- **ungated mechanical work**: each run redoes a fetch, diff, compare or threshold from scratch that a box script could do. Fix: a gate script the routine runs first, ending silently when it prints NOTHING, so AI runs only on change and on judgment
- **timer for an event**: polls on a schedule for something an event trigger (GitHub, Slack, email, webhook) could fire on
- **long chat**: a recurring routine running inside a long-lived chat, so every run pays for a big context
- **dead**: errors every run, or depends on something missing (a skill, a folder, an auth)
- **duplicate**: two routines (same or different bots) doing the same job
- **heavy share**: one routine takes a large share of usage relative to its value

## Report
- Nothing flagged: send nothing at all. No filler.
- Otherwise: one short list, one line each: bot, routine, flag, suggested fix (lower frequency, weekdays only, add a gate script, switch to an event trigger, stay quiet when empty, move to a fresh session, pause, merge). Then a question widget so the user picks which to apply.
- Apply fixes to your own routines only after the user picks. For another bot's routine, message that bot with the exact change only after the user picks.
