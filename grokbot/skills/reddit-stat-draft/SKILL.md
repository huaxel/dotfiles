---
name: Reddit stat draft
description: >-
  Use when turning a stats post (named, or the strongest of the past week by
  engagement) into a Reddit-native draft with subreddit-rule research; never
  posts.
---
# Reddit stat draft

1. **Pick the source post.** Use the one the user named, or pull the account's posts from the past 7 days (public X reads, `get_users_posts` with `post.fields=public_metrics,created_at,attachments`) and take the 1 or 2 with the most engagement.
2. **Pick the subreddit.** List candidates (the national football sub, r/soccer, the country sub, club subs, r/dataisbeautiful for chart-led work). For each, WebFetch `https://old.reddit.com/r/<name>/about/rules` and the sidebar. Confirm the sub exists and allows this kind of post, and note flair, [OC] tagging, self-promo limits, and link/image/text rules.
3. **Write the draft.**
   - Title in that sub's style. No clickbait, no emoji.
   - Body leads with the analysis, then explains method and source, then invites discussion.
   - Link the original chart.
   - At most one closing line pointing to the X account, and only if the rules allow it.
   - Voice: a knowledgeable fan talking to fans, no marketing tone.
   - Stats exactly as in the original post.
4. **Deliver** the sub (with the rules that matter: flair, tag, self-promo), the title, the body, and a suggested posting time. Never post, comment, vote or message on Reddit.
