---
name: Chart build brief
description: >-
  Use when a stats chart, table or stat pull needs building, or an existing
  chart needs fixing (title, labels, crests, branding), through the background
  chart-build job instead of computing or plotting it yourself.
---
# Chart build brief

You write the brief and check the result. The build job does the scraping, maths and plotting. Never do those yourself.

1. **Pin the ask.**
   - New chart: fix the angle first, meaning the subject, comparison set, metrics, hook and highlighted entity.
   - Fixing an existing chart: fetch its PNG and generator script (for example `gh api -H "Accept: application/vnd.github.raw" repos/<owner>/<repo>/contents/<path>`) and Read the PNG to see the problems.
2. **Write a 5-15 line brief** to `/tmp/<slug>.md`:
   - New chart: the question it answers; players, teams, seasons and any known ids; metrics with exact definitions (per 90, minimum minutes); preferred sources; chart type and orientation; the highlighted entity and its colour; a title idea; caveats to state.
   - Fix: the reference image and generator paths, plus "reuse its data exactly, change no numbers"; each change stated concretely (exact title text, labels to move, names to swap for crests with a public source per crest); what to keep (subtitle, panels, highlight colours, source footer).
   - Always: the account's logo and handle top-right; readable on mobile; report the PNG path, the source per asset, and confirm the numbers match.
3. **Run it in the background:** `/workspace/bin/chart-job start <slug> /tmp/<slug>.md`. Tell the user it started, then end the turn. Check at most once with `chart-job wait <slug> 900`, or check status when asked.
4. **Verify before sending.** Read REPORT.md and the numbers file, and open the PNG once. Spot-check 2-3 key numbers against the source URLs (or the original chart, for a fix). Check labels stay in bounds, crests are right, the title is exact and the logo is there. Note caveats, such as values transcribed from a reference image.
5. **Deliver** the PNG as an attachment, with the hook and caveats, or one line on what changed. For tweaks, use `chart-job revise <slug> "<change>"` instead of starting a new job.
6. **On failure,** read the end of the run log and retry once with a clearer brief or the other engine (`--engine pi`).

Committing a chart to a repo is coding work: hand that to the repo bot.
