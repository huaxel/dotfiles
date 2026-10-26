# Uncle Bob Gauntlet — Review and Verification Discipline

Applies to any substantial change (security-sensitive, architectural,
public-API, migration, or cross-subsystem): no completion claims without
fresh verification evidence and, where the change warrants it, an
independent read-only review.

## Reviewer dispatch

Dispatch the configured read-only `reviewer` subagent with changed file
paths, requirements, and optionally a readable patch artifact — commit
SHAs alone are not enough. Fix Critical and Important findings; rerun
affected checks after each fix before claiming completion.

## Verification gate

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Run the project's documented quality/verification command fresh, read the
full output including skips and warnings, confirm the exit status, and
report the result with evidence. No "should pass," "probably fine,"
"looks good." A skipped check is visible and requires judgment — it is
not silently treated as proof of quality.

## Integration

Use `worker` for implementation and `reviewer` for independent review.
Apply this discipline when the change warrants it; do not force a heavy
ceremony onto docs/config work. Report skipped checks explicitly.
