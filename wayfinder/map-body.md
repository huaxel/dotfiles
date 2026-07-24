## Destination

A manual on-demand, agent-assisted **pi health check** ritual that covers performance and cost review, configuration hygiene (detecting cruft and drift), and reliability assessment — delivered as a `just pi-healthcheck` task that produces a dual-format (terminal + JSON) report. The ritual identifies issues and recommends action but does not auto-fix.

## Notes

- **Domain:** Pi (coding agent) configuration, extensions, packages, models, cost tracking, session management
- **Skills:** `systematic-debugging` for investigating crash/failover patterns; `wayfinder` for decision tickets
- **Dotfiles repo is source of truth** — `~/dotfiles/pi/agent/` is canonical, `~/.pi/agent/` is the runtime deploy target
- **Agent preference:** Subagent over workflow (per AGENTS.md)
- Each session resolves exactly one decision ticket (research tickets can be parallel)
- Produce decisions, not deliverables — this map charts until the way is clear, then hands off

## Decisions so far

<!-- no tickets closed yet -->

## Not yet specified

The following areas are visible but not yet sharp enough to ticket:

1. **Health check output format details** — Both terminal and JSON are desired, but the exact schema (what fields, what severity levels, what summary stats) needs design. Will be specifiable once the scope ticket is resolved.
2. **Crash/failover investigation** — The opencode-go-failover.log is 472K and the pi-crash.log is 204K, but root causes are not understood yet. Needs systematic debugging once we decide to investigate.
3. **Observability completeness** — The history.jsonl has only 10 entries. Is the pipeline broken or just new? Needs investigation once the observability ticket is resolved.
4. **Deployment/sync process** — How does the dotfiles config get deployed to ~/.pi? Is there a script, a symlink, or manual copy? Understanding this is needed before drift detection can be fully designed.
5. **Which models/packages/extensions are actively used** — Need to determine usage before pruning decisions can be made.

## Out of scope

- **Auto-fix** — explicitly ruled out; the health check reports only
- **Continuous/scheduled runs** — manual on-demand only
- **General pi feature work** — this is about health monitoring, not building new pi features
