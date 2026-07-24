# Pi Health Check — Wayfinder Map

## Context

The user wants to optimize their pi (coding agent) setup across performance/cost, configuration hygiene, and reliability. After investigation, the destination was identified as a **manual on-demand, agent-assisted "pi health check" ritual** — a `just pi-healthcheck` task that produces a dual-format (terminal + JSON) health report covering all dimensions, but does not auto-fix.

This effort is charted using the wayfinder skill on the [huaxel/dotfiles](https://github.com/huaxel/dotfiles) GitHub issue tracker.

## Destination

A `just pi-healthcheck` task that, when run, examines:
- **Performance & cost** — session costs, observability data
- **Configuration hygiene** — drift between dotfiles (source of truth) and ~/.pi (runtime), unused packages/models/extensions
- **Reliability** — crash logs, failover patterns, error rates
- **Session storage** — what's consuming ~520MB and what to prune

The report is both human-readable (terminal) and machine-readable (JSON). It identifies issues and recommends action but does not auto-fix.

## Map

**Map issue:** [#13 — Pi Health Check — a continuous optimization ritual for the pi setup](https://github.com/huaxel/dotfiles/issues/13)

### Tickets Created

| # | Title | Type | Status | Blocked By |
|---|---|---|---|---|
| 14 | Health Check Data Sources | research | OPEN | — |
| 15 | Observability Pipeline Status | research | OPEN | — |
| 16 | Session Storage Audit | research | OPEN | — |
| 17 | Crash and Failover Pattern Analysis | research | OPEN | — |
| 18 | Config Sync Investigation | research | OPEN | — |
| 19 | Config Drift Detection Approach | research | OPEN | #18 |
| 20 | Health Check Output Design | grilling | OPEN | #14 |

### Frontier (takeable now)

1. **#14 — Health Check Data Sources** — Catalog all available pi data sources (observability, logs, configs, sessions)
2. **#15 — Observability Pipeline Status** — Why only 10 entries in history.jsonl?
3. **#16 — Session Storage Audit** — What's consuming 520MB, what's safe to prune?
4. **#17 — Crash and Failover Pattern Analysis** — What reliability issues exist?
5. **#18 — Config Sync Investigation** — How does dotfiles deploy to ~/.pi?

### Blocked

- **#19 — Config Drift Detection Approach** ← blocked by #18 (need to understand sync first)
- **#20 — Health Check Output Design** ← blocked by #14 (need to know data sources first)

### Not Yet Specified

The following will graduate into tickets as the frontier advances:
- Exact JSON schema for the health check report
- Retention policy implementation details
- Which models/packages/extensions are actively used (needs usage data from resolved tickets)

### Out of Scope

- Auto-fix — report only
- Continuous/scheduled runs — manual on-demand only
- General pi feature work

## Key Decisions Made (Charting Session)

- **Destination:** Manual on-demand `just pi-healthcheck` task producing terminal + JSON report
- **Actionability:** Report only (no auto-fix)
- **Location:** Just task in the justfile
- **Verification:** Existing justfile already has `pi-stats` and `pi-session-size` tasks that can serve as patterns
- **Tracker:** GitHub Issues on huaxel/dotfiles repo (gh CLI available)

## Config Drift Discovered

During investigation, significant drift was found between dotfiles (source of truth) and ~/.pi (runtime):

- **Thinking level:** dotfiles = "high", runtime = "low"
- **Default provider/model:** configured in dotfiles, null in runtime
- **Packages:** 5 packages only in dotfiles, 2 only in runtime
- **Models:** Different sets enabled (cline-pass models only in runtime, opencode/nan free models only in dotfiles)
- **lastChangelogVersion:** 0.82.0 (dotfiles) vs 0.0.0 (runtime)

## Next Steps

When working through this map:

1. Claim and resolve each research ticket on the frontier (they can be run in parallel)
2. Once #14 and #18 are resolved, the blocked tickets (#19, #20) become takeable
3. After all tickets are resolved, the map is complete — the health check design is ready for implementation
4. Hand off to an implementation session to build `just pi-healthcheck`

## Verification

Health check of the map itself:
- [x] Map issue created with label `wayfinder:map`
- [x] All child tickets have correct labels (`wayfinder:research`, `wayfinder:grilling`)
- [x] All child tickets are parented to the map
- [x] Blocking relationships documented via comments
- [x] Frontier is visible (open, unblocked tickets)
- [x] Fog of war documented in "Not yet specified"
- [x] Out of scope clearly defined
