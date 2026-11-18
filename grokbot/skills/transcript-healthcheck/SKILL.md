---
name: Transcript healthcheck
description: >-
  Use when auditing Grok Bot fleet transcripts for user friction and proposing
  new skills, bots, or routines from what you find.
---
# Transcript healthcheck

Goal: find places where the user hit friction with any of their bots, and propose at most a few fixes. Propose only. Never create anything from the report alone.

## Sources
- Bots: the teammates list in your instructions, plus yourself.
- Transcripts: `ReadTranscript` (cursor namespace). `in` = a teammate's agent id, or omit for your own session. Results come newest first; page back with `before` until you pass the window start. Use `limit` 100-200.
- Do not look for transcript folders on disk; there are none. Skip subagent transcripts.

## Window
Since the last successful run of the routine that called this, else the last 24 hours.

## Steps
1. For each bot, read its transcript back to the window start. Fan out across bots with parallel calls; for more than ~4 bots with long windows, hand batches to background workers and have each return findings only.
2. Look only at real user messages and how the bot answered. Flag:
   - the user correcting, repeating, or rephrasing the same ask
   - frustration, or the user doing a step by hand that a bot could have done
   - a bot claiming it can't do something, or stalling, asking needless questions
   - the same multi-step request across days (a skill or routine candidate)
   - work landing in a bot whose job it isn't (a new bot, or a redirect)
3. Ignore routine wakes that went fine, and one-off hiccups that were already fixed in the same chat.
4. For each finding write: bot, what happened (one line, paraphrased, no verbatim complaints), proposal type (skill | bot | routine | persona tweak), and the proposal in one line.

## Report
- Nothing worth proposing: send nothing at all. No filler.
- Otherwise: one short message, at most 5 findings, best first, then a question widget letting the user pick which to do.
- Do not create, edit, or message any bot until the user picks.
