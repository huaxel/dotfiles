# Planning game ID resolution extension compatibility

## Task
Assess whether the planning game ID resolution approach breaks any Pi extensions.

## Human notes

## Todos
- [ ] Identify the planning game ID resolution changes
- [ ] Compare extension consumers and compatibility assumptions
- [ ] Report breakages or confirm no impact

## Progress
- Started compatibility review.
- Traced the shared resolver output and searched all Pi extension/config consumers.
- Confirmed the live `small` resolver result and compared it with Pi's enabled model catalog.

## Findings
- The resolver now emits canonical IDs such as `commandcode/deepseek/deepseek-v4-flash` in JSON (`{"model": "..."}`).
- `pi/agent/extensions/answer.ts` is the only source extension that directly invokes `~/projects/agentq/bin/resolve-model.sh`; it parses the JSON correctly and splits only at the first `/`, so nested model IDs are handled safely.
- However, the current Pi catalog has no `commandcode` models enabled. Therefore `/answer` will reject a resolver-selected `commandcode/...` model via `modelRegistry.find()` and silently fall back to `openai-codex/gpt-5.6-luna` or the current model. This is a degraded routing result, not an extension crash.
- The resolver's `openai-codex/gpt-5.6-*` candidates remain compatible with `answer.ts` and the configured agent profiles.
- Other Pi extensions do not consume the resolver output directly. `pi-agy` has its own alias/default routing contract, and `pi-multi-opencode-go` only documents/invokes the resolver conceptually; no breaking API coupling was found.
- `resolve-model.sh` comments say plain model-string output, but its actual `--json` path returns an object. `answer.ts` depends on the actual JSON contract; changing the wrapper to plain text without updating it would break `/answer` model selection (with fallback).

## Decisions
- Treat the approach as extension-compatible, with one functional gap: commandcode results are currently ignored by `/answer` because that provider is absent from `enabledModels`.

## Questions / Next steps
- If commandcode routing is intended for `/answer`, add the corresponding commandcode provider/models to Pi's catalog and test `modelRegistry.find()` against the nested IDs; otherwise document the intentional fallback.
