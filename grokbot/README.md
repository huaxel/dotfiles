# Grok Bot skills backup

Copies of the skills saved by my Grok Bot bots, one folder per skill id under `skills/`.
The source of truth is Grok Bot (`/home/box/agent-data/workflows/` on the bot's box); edit skills there, not here.
To refresh, run `grokbot/sync-skills.sh` on the box, then commit. It uses `rsync --delete`, so removed skills disappear.
