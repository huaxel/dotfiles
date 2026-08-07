---
name: golden-drift
description: Triage a failing seed-42 golden playtest — decide regen-vs-fix by fingerprinting RNG consumers. Use when golden.test.ts fails or docs/playtests/cli/seed-42 drifts.
---

# golden-drift

Python-backed skill for BelPolSim golden-drift triage.

When the seed-42 golden test fails, a drift is either a **legitimate gameplay change**
(regenerate goldens + review the diff) or an **accidental RNG-stream shift** (a regression
you must NOT paper over). This skill fingerprints the changed files against known
RNG consumers and classifies the drift.

## Use

```python
await golden_drift(repository=".", seed=42)
```

Returns a dict with `changed_files`, `touched_rng_consumers`, `drift_causes`,
`verdict` (`"regen"` | `"fix"`), and `commands` (e.g. `pnpm playtest:golden` only when
verdict is `regen`).

## Known RNG consumers (encoded from BelPolSim review memories)

- RandomService (`src/core/logic/services/RandomService.ts`) — the RNG stream.
- Inbox generator: MorningBriefingSystem -> ProceduralGenerator.balanceAndShuffleInbox (events feed it; prune after the pipeline).
- Rival strategies: FormationRivalStrategy, GoverningRivalStrategy, CampaignRivalStrategy (`src/features/opposition/logic/rivalStrategies/`).
- blockagesForFootprint: `col = (hash * 7) % (maxCol + 1)` pins 1-wide footprints to column 0.
- Caveats: array LENGTH fed to an RNG consumer must stay constant to preserve streams;
  inbox content shifts the null-bot hand; rival RNG consumption re-pins demos.