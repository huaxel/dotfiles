---
name: Stat post copy
description: >-
  Use when writing or tightening an X post, hook or reply thread built on a stat
  (sports or other data), ready for the user to publish via intent links.
---
# Stat post copy

1. **Source every number first.** Open the data file or source page and confirm each figure before writing. Record the file path or URL. Never estimate or add a superlative ("biggest", "widest", "first since") that you haven't checked against the data. Drop it if it isn't verified.
2. **Hook = stakes in line one.** Lead with named entities (clubs, players), not a league average or throat-clearing. Prefer timely angles tied to the current round or upcoming fixtures.
3. **Voice.** Dry, sharp, numbers-first, at most one emoji, no hype words. Prefer verifiable wording over loaded terms ("second division", not "semi-pro"). Make pace or trend claims unambiguous ("at the 10-year pace"), and don't claim acceleration unless the series shows it.
4. **Structure.** Main post is ≤280 characters and ends on a debate question where it fits. Method, source and secondary angles go in the replies. No links in the main post body.
5. **Check the chart against the copy.** If a chart's title implies something the data doesn't (e.g. the entity isn't #1), say so and handle it in the copy.
6. **Count characters** with python `len()` and trim to ≤280. Save each post as a .txt file.
7. **Intent links.** `https://x.com/intent/post?text=` + `urllib.parse.quote(text)`. For replies, wait for the live post URL, then add `&in_reply_to=<post id>`.
8. **Deliver.** Show the copy in quote blocks with character counts, the intent link(s), which image goes with which post, and any caveat about the data. Never post yourself.
