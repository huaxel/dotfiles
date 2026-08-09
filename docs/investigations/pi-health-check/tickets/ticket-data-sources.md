## Question

What data sources exist or should exist for a comprehensive pi health check? Investigate:

1. What observability data is currently captured (history.jsonl — only 10 entries, why so sparse?)
2. What's in the pi-crash.log (204K) and opencode-go-failover.log (472K) — what kinds of events?
3. What session data exists (520MB across dotfiles and ~/.pi) — what's the structure?
4. What config files need comparison (settings.json, models.json, auth.json, trust.json, packages, extensions)?
5. What other pi data sources exist (run-history.jsonl, etc.)?
6. What does the dynamic-footer observability package actually capture?

Deliverable: A categorized inventory of all data sources with their location, size, schema, and relevance to a health check.
