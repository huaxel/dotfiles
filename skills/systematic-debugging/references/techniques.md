# Tracing and timing

Locally rewritten from Superpowers’ root-cause tracing, condition-based waiting, and defense-in-depth guidance at the revision recorded in [UPSTREAM.md](../UPSTREAM.md). MIT; see [LICENSE](../LICENSE).

## Trace the value, not just the exception

1. Observe the invalid value at the failure site.
2. Find its caller or writer and the contract that should have constrained it.
3. Follow the chain to where valid state first became invalid.
4. Test that boundary directly, then verify the original end-to-end reproduction.

For example, a file written into the wrong repository may originate in an empty working-directory argument several callers earlier. Logging a redacted path, operation, and call stack can identify that transition; dumping every input is unnecessary.

Enforce the invariant at the owning boundary. Add another guard only when it protects a genuinely separate trust or execution boundary. Repeating the same check at every layer is not automatically stronger architecture.

## Wait for evidence

Prefer a ready event, state predicate, observable output, or completed operation over an arbitrary sleep. Use a bounded timeout and report the last observed state when it expires. Sample fresh state on each check; respect cancellation and keep polling proportional to the operation.

A timeout is an observation, not a diagnosis. Do not simply inflate it until a test passes. For tests of debounce, expiry, or other actual timing contracts, control the clock or document why real elapsed time is required.

## Isolate order-dependent failures

Compare isolated execution, a known failing sequence, and reordered or reduced sequences. Check fixture lifetime, global state, clock state, ports, temporary directories, and cleanup. Reproduce against an isolated test instance; never delete an unexpected file merely to make the next run start clean.

Use the project’s runner to narrow the preceding tests. Keep exit status and failure evidence rather than suppressing all output. Retain the smallest failing sequence as a regression when feasible.
