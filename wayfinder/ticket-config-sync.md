## Question

How does the dotfiles pi config (~/dotfiles/pi/agent/) relate to the runtime config (~/.pi/agent/)?

1. Is there a deployment script, a dotter template, a symlink, or manual copy?
2. Investigate the dotter configuration (~/.dotter/) and the justfile for any deployment mechanism.
3. Check if specific files are symlinked vs separate copies.
4. What's the intended sync process — and what's actually happening given the drift observed?
5. Are there files that should be in dotfiles but aren't (e.g., models-store.json is only in dotfiles)?

Deliverable: A mapping of which configs are source-of-truth in dotfiles, which are runtime-only, and how synchronization works (or should work).
