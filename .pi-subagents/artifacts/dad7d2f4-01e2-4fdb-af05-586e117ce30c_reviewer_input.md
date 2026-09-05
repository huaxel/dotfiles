# Task for reviewer

Review only the uncommitted change in `pi/agent/settings.json`; do not comment on the unrelated uncommitted package manifest/lockfile changes.

Requirement: eliminate Pi's startup `herdr` skill collision between the retained user skill at `~/.agents/skills/herdr/SKILL.md` and `@ogulcancelik/pi-herdr`'s bundled skill, while keeping the package's `index.ts` extension enabled.

The intended mechanism is Pi package filtering: the package entry was converted from a string to `{ "source": "npm:@ogulcancelik/pi-herdr", "skills": [] }`.

Inspect the changed settings, the installed package manifest at `pi/agent/npm/node_modules/@ogulcancelik/pi-herdr/package.json`, and the relevant local Pi package/skill documentation if useful. Verify JSON validity, scope, resource-filter semantics, and any regression risk. Read-only: do not edit files. Return only concrete findings with severity and file:line references, followed by a merge-readiness verdict.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```