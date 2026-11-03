# Local evaluation harness

The skill bundles [skill_eval.py](../scripts/skill_eval.py) and a [Pi model adapter](../scripts/skill_eval_pi.mjs). The dotfiles repository also provides thin entrypoints under its scripts directory; the commands below use those entrypoints from the dotfiles root. For a standalone copy, invoke the bundled script by its absolute path instead.

## What it evaluates

This is deliberately a **text-only reasoning comparison**, not a full agent harness. Each request receives only a fixed neutral system prompt, one version’s SKILL.md text including metadata (or none), and the task. It gets no tools, global instructions, plugins, memory, prior messages, or hidden rubric. The adapter uses Pi’s model runtime directly; it never starts an interactive or recursively delegating Pi agent.

It does not exercise automatic skill selection, reference-file discovery, real tool use, application side effects, or OS isolation. Do not claim otherwise. Model output is parsed as JSON data and is never executed. Only reviewed synthetic tasks should go to this harness. Existing provider authentication stays in its normal location; credentials are not copied into evaluation directories or reports. No provider fallback, overage activation, or runtime tool installation is performed.

## Freeze before running

A spec declares `repeats`, `versions`, and `tasks`, with explicit `provider` and `model` in the spec or supplied at freeze time. `versions` maps names to skill directories relative to the spec file, plus `none: null`. A new skill can compare `after` and `none`; a diet should include `before`, `after`, and `none`.

Each task has an `id`, `prompt`, and nonempty `expected` JSON fields. The grader checks those fields with exact types, allowing additional explanatory fields. This only validates the specified answers; inspect explanations yourself and add held-out cases for claims the fields do not capture.

```bash
python3 scripts/skill_eval.py freeze \
  scripts/fixtures/skill-eval/blast-radius.json \
  /tmp/blast-radius-pilot \
  --provider "$PI_PROVIDER" --model "$PI_MODEL"
```

Freeze performs no inference. It captures the task spec, model identifier, all skill-file hashes, supplied runtime text, and adapter/harness hashes and source snapshots. The output directory is create-only. A frozen evaluation permits at most 100 planned calls. Source changes, including new reference files, invalidate the plan. Use a new directory rather than mixing attempts or silently reusing records.

## Explicit execution budget

```bash
python3 scripts/skill_eval.py run /tmp/blast-radius-pilot \
  --allow-model-calls --max-calls 6 --timeout 90
python3 scripts/skill_eval.py score /tmp/blast-radius-pilot
```

The sample pilot is three tasks × two versions × one repetition. These calls consume the selected account’s normal inference quota. Execution is serial, alternates versions within cases, and has a per-call timeout and output bound. A failed request stops the run and retains partial evidence. The scorer then fails closed; no automatic retry or resume occurs.

`run` requires explicit opt-in and a sufficient call budget. The bundled adapter expects the managed Pi install beneath `PI_CODING_AGENT_DIR` and uses an installed physical model, with extensions and custom model configuration absent. Native plugin-provided models may therefore be unavailable. Record the runtime version and acknowledge that an unchanged model ID does not pin the provider’s backend forever.

## Acceptance and reporting

Zero runs, missing repetitions/versions, unexpected records, wrong plan/model identities, tools enabled, mixed SDK versions, failed adapters, and stale input hashes are rejected. A complete matrix with candidate failures exits nonzero. Never modify the rubric after seeing failures and rescore old results as if the task were unchanged.

An all-pass pilot is **not promotion evidence by itself**. A no-skill baseline that also passes everything shows no observed benefit on these cases. One trial per task cannot establish statistical non-inferiority, effectiveness across projects, or token savings. Use repeated and broader held-out cases, with runtime/tool tests in an appropriately isolated agent harness, before automatic activation or a strong quality claim.

Records contain the answer, aggregate token count, source identities, and runtime identity—not provider cost objects or raw session dumps. Keep them local until reviewed. The unit tests use fixture records and mock the adapter; they test the acceptance gate, not model behavior.
