---
name: Routine healthcheck
description: >-
  Use when auditing the Grok Bot fleet's routines for usage waste: too frequent,
  noisy empty runs, dead or duplicate routines, or routines on long chats.
---
# Routine healthcheck

Goal: spot routines that burn usage for little value, and suggest fixes. Suggest only. Never edit another bot's routines unless the user says so.

## Sources
- Usage: `CheckSubscriptionUsage` (cursor namespace) with `breakdown: ["bot","routine"]`, `period: "last_7_days"`, `limit: 10`. This gives each bot's and routine's share of usage. Read the Cursor-managed `usage-review` skill before interpreting it, and report shares in its words.
- Your own routines: the latest automation_status reminder, and `UpdateRoutine` get for saved prompt and schedule.
- Other bots' routines are not readable from here. Infer them from `ReadTranscript` with `in` = that bot's id: routine wakes show up as runs in its transcript. Read the last 7 days.
- There are no routine folders or transcript folders on disk to read.

## Flags
- **too frequent**: runs more often than its output is useful (e.g. hourly with daily-value output)
- **noisy empty**: most runs find nothing yet still send a message, or run long to conclude nothing
- **long chat**: a recurring routine running inside a long-lived chat, so every run pays for a big context
- **dead**: errors every run, or depends on something missing (a skill, a folder, an auth)
- **duplicate**: two routines (same or different bots) doing the same job
- **heavy share**: one routine takes a large share of usage relative to its value

## Report
- Nothing flagged: send nothing at all. No filler.
- Otherwise: one short list, one line each: bot, routine, flag, suggested fix (lower frequency, stay quiet when empty, move to a fresh session, pause, merge). Then a question widget so the user picks which to apply.
- Apply fixes to your own routines only after the user picks. For another bot's routine, message that bot with the exact change only after the user picks.
