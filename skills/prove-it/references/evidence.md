# Evidence design

## Observe the promised outcome

A successful HTTP response does not prove a durable write. A file timestamp does not prove its contents. A worker’s summary does not prove its commands ran. An old screenshot does not prove the current build. Choose an observation that can distinguish the promised behavior from these alternatives.

For persistence, write through the real interface, restart or reopen when the claim requires it, then read through an appropriate independent observation. For failure handling, trigger the specific failure in an isolated instance and verify the resulting state, not just the log message.

## Make the check capable of disagreeing

Challenge the check with a known-bad fixture, boundary value, or isolated broken variant. Confirm failure occurs for the right reason, then return to the original or corrected case. Keep production and shared work untouched. If a negative control is infeasible or outside scope, report that limitation rather than fabricating one.

Do not derive the expected value from the implementation being checked. Paired encode/decode functions may share a bug; a roundtrip can need independent known examples. Two models agreeing on an answer is not an independent empirical oracle.

## Formal claims need a correspondence argument

Choose the property first. Interleavings and lifecycle rules may suit a small transition model; arithmetic and memory safety may suit code-level verification. Do not reach for a hand-written model of a pure function merely because it is easier to prove than the code.

Record:

- The invariant or progress property and its user-visible consequence.
- Model variables/actions mapped to actual functions, state, and synchronization.
- Initial states, environmental assumptions, scheduling/fairness, and excluded behavior.
- Input bounds or explored state scope, checker result, and whether exploration completed.
- How a broken variant challenges the property, and any replay against actual code.

A timeout, state-space cutoff, vacuous precondition, or unchecked property is not a pass. A model counterexample is first a counterexample to the model; establish code correspondence before calling it a demonstrated implementation defect. Do not advance a model’s claimed source version until that correspondence has been rechecked.

## Numbers need experiments

For performance or reliability claims, identify the real workload, baseline, metric, and limiting resource. Compare like with like; repeat runs, disclose variability, and account for caches, warmup, errors, load, and omitted work. A faster isolated function may not improve the end-to-end path. Hold out evaluation data when selection or tuning could bias the result.

Use the least elaborate evidence record that preserves the claim, exact check, observed result, and limitations. Scale the method to the consequence of being wrong.

Model correspondence, broken-variant checks, and rerunnable verification are informed by pstack; see [source notes](../UPSTREAM.md).
