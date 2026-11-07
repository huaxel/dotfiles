---
name: dream
description: Dream pass for pi memory. Verify and correct MEMORY.md against daily logs, distill the week's dailies into durable entries, prune the scratchpad, maintain the project wiki in the Obsidian vault (~/JBM/Pi/), and refresh the MEMORY.md INDEX. Use when the user says "dream", "run the dream pass", asks to organize, clean up, or consolidate memory, or when running from the weekly schedule.
---

# Dream pass

Offline memory consolidation (architecture record: `[[pi-dream]]` entry in MEMORY.md). You have the full memory toolset. Work through the phases in order; skip a phase only with a stated reason in the dream log.

## Ground rules

- Write ONLY inside `~/.pi/agent/memory/` and `~/JBM/Pi/`. No repo edits, no git operations, no network.
- Corrections go through `memory_forget` (recovery IDs are the safety net) followed by a `memory_write` of the corrected fact. Never raw-delete old entries. The only section you regenerate wholesale is the INDEX, between its `<!-- INDEX START` / `<!-- INDEX END -->` markers.
- If Juan has hand-edited a wiki page since the last dream, preserve his wording and reconcile around it; note it in the dream log.
- Uncertain whether a fact drifted? Record the doubt in the dream log; do not change memory.
- Keep each wiki page under ~3KB. Abstract and link; never transcribe sources (the wiki must stay smaller than what it describes).
- Single-writer rule: only dream passes edit `~/JBM/Pi/*`. If a normal session recorded new project facts in memory, the dream pass promotes them into the wiki.

## Phase 1 — Read

Read: MEMORY.md in full; SCRATCHPAD.md; the last 7 daily logs (`memory_read target: list` for names); every page in `~/JBM/Pi/`; the most recent dream log in `~/.pi/agent/memory/dream/`; `memory_status`.

## Phase 2 — Verify and correct

Pick MEMORY.md entries that touch active projects and predate the last dream. Check them against newer daily logs and, where cheap, against disk reality (do the paths/files/configs they describe still exist and match?). Correct what is provably stale via `memory_forget` + `memory_write` (precedent: the 2026-11-08 Obsidian vault correction). Update the project's wiki page if its status changed.

## Phase 3 — Distill

Scan the week's daily logs for durable decisions, lessons, and preferences not yet in MEMORY.md; write them with `#tags` and `[[links]]`. Do NOT promote ephemeral state (CI runs, in-flight tasks) — that belongs in wiki status lines or the scratchpad.

## Phase 4 — Scratchpad

Mark `scratchpad done` for items the dailies show resolved; leave genuinely open ones alone; `clear_done`.

## Phase 5 — Wiki

Update each `~/JBM/Pi/<slug>.md` (status, rules, traps, `updated:` date). Create pages for newly active projects. For dormant projects, collapse the page into a one-line "Dormant" entry in `~/JBM/Pi/README.md` and delete the page only if it has no unique content.

## Phase 6 — INDEX

Regenerate the section between the INDEX markers at the top of MEMORY.md: date, active-project one-liners, standing preferences, recently-corrected notes. Keep it under 2KB (the session snapshot injects head+tail of MEMORY.md, 4K total).

## Phase 7 — Dream log

Write `~/.pi/agent/memory/dream/YYYY-MM-DD.md`: corrections made (with recovery IDs), entries distilled, scratchpad prunes, wiki changes, and unresolved doubts for the next dream. This log is the shared coordination record between dream passes.

## Phase 8 — Reindex

Run `qmd update && qmd embed` so memory and vault changes are searchable.
