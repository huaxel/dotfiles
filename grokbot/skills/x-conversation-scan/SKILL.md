---
name: X conversation scan
description: >-
  Use when scanning X (and optionally a subreddit's RSS) for live posts in a
  niche where a stats account could reply with a number and reach new people;
  returns at most 5 ranked picks plus mentions worth answering.
---
# X conversation scan

Inputs: the account's X user id, the niche's topics (teams, players, competitions, transfer chatter), languages, the country WOEID, optional subreddit.

1. Read the X tool guide skill first. Budget a handful of reads per run (limits: 30/min, 1000/day, 25 results per call).
2. Pull the account's recent mentions (`get_users_mentions`). Keep any that ask a question, challenge a number, or come from a sizeable account.
3. Pull country trends (`get_trends_by_woeid`) and note any niche names trending.
4. Run 3-5 `search_posts_all` queries with `since:` set to the last ~24h, mixing topic names, languages, and `min_faves`/`min_retweets` filters to skip noise. Add one `search_news` call for the day's storylines.
5. Optional: read the subreddit's RSS (`/r/<sub>/new/.rss`, browser User-Agent, 10-20s pacing).
6. Rank candidates by reach (author size, views, reply velocity) and fit (a stat would add something the thread lacks). Drop anything stale, purely emotional, or already answered with numbers.
7. Output at most 5 picks: post link, one line on why it matters, one suggested stat angle. List the mentions that deserve a response separately. Name the single strongest pick.
8. If nothing clears the bar, send nothing. Never reply, like, repost or DM; the user acts.
9. Log the day's flagged post ids to the journal so later runs skip repeats.
