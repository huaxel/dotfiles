## Question

How should we detect and report config drift between dotfiles (~/dotfiles/pi/agent/) and runtime (~/.pi/agent/)?

Once we understand how sync works (from ticket "Config Sync Investigation"), we need to decide:

1. Which specific files/folders should be compared?
2. What constitutes drift? (missing files, different values, extra files on one side)
3. Should we compare full JSON objects or specific keys?
4. Should we ignore certain fields (like lastChangelogVersion, auth tokens)?
5. What format should the drift report take?

Deliverable: A decision on what drift detection covers and how it's reported.
