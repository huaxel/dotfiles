---
name: X weekly growth report
description: >-
  Use when writing a weekly (or on-demand) growth report for an X account:
  follower change, best and worst posts by engagement, patterns, and what to try
  next.
---
# X weekly growth report

Inputs: the X account (numeric user id), a log folder on the box, and the report's time zone.

## 1. Pull data (public X read tools; look up current schemas first)
1. Follower count: get_users_by_id with user.fields=public_metrics.
2. Posts from the last 7 days: get_users_posts with start_time = now minus 7 days, max_results 25 (paginate if needed), post.fields=public_metrics,created_at,attachments,referenced_tweets,edit_history_tweet_ids,conversation_id,in_reply_to_user_id, expansions=attachments.media_keys, media.fields=type.
3. Classify each post:
   - Kind: original, thread follow-up (in_reply_to own id), reply to others, or quote.
   - Format: chart/image, text, video, or thread opener.
   - Topic: in the account's own terms.
   - Posted time, in the report's time zone.
   - Edits: if edit_history_tweet_ids has more than one id, the post was edited. Combine the versions' metrics, or note the split.

## 2. Log (so week-over-week change is real)
- Keep log.jsonl in the log folder, one JSON line per check.
- A weekly line has "type":"weekly" (or no type). It holds the date, follower count, post count, and for every post: id, link, text snippet, created_at, metrics, format and topic.
- Mid-week or ad-hoc checks get "type":"midweek_check" and never serve as the weekly baseline.
- Compare against the most recent weekly line. If there is none, say this is the first data point. Never estimate a trend.

## 3. Rank
- Engagement = likes + reposts + replies + quotes. Engagement rate = engagement divided by impressions, when impressions are available.
- Rank originals and thread openers by engagement, using impressions to break ties. Rank replies to others separately, or leave them out, because they always score low.
- Pick the top 3 and bottom 3. Give each one's link, impressions, engagement and posted time.
- Note post age: a post under 24h old is still accumulating. Say so rather than calling it a flop.

## 4. Report (calm, short, plain English, no cheerleading)
1. Follower change since the last weekly baseline, naming both dates and counts.
2. Top 3 and bottom 3 posts with links and numbers.
3. The pattern, across format (chart vs text, threads), topic, hook style and timing. Compare against the account's typical (median) post when a back-catalogue benchmark exists.
4. Two or three concrete things to try next week, each tied to a number above.

If nothing was posted in the window, say so in one line, and still log and report the follower count.

## Diagnosing a single post that underperformed
Compare its impressions and engagement against the account's median for the same format and topic. Then check four things, in order of impact:
- Timing versus the account's best slot, and anything competing for attention, like live matches.
- Reach versus engagement rate. A normal rate on low reach points to distribution, not content.
- Hook clarity. Jargon or a hedged claim performs worse than one plain fact or record.
- Repeats and edits. A repost of the same story, or an edit that splits the post, both cut reach.

Append the diagnosis to a dated review file in the log folder.

## Rules
Never fabricate a metric. If a number is unavailable, say so. Read-only: never post, reply or DM.
