# Audit patterns

## A machine hidden in flags

Suppose a job stores `started`, `finished`, `cancelRequested`, `workerId`, and `result`. These are candidate state variables, not yet a specification. Inspect readers and writers before naming states such as queued, running, cancelling, succeeded, and failed.

A useful table separates control from payload:

| Current state | Event and guard | Next state | Side effect | Evidence |
|---|---|---|---|---|
| Queued | Claim succeeds atomically | Running | Assign worker | Actual claim operation and its tests |
| Running | Result accepted for current attempt | Succeeded | Persist result and notify | Writer plus notification path |
| Running | Cancel requested | Cancelling | Signal worker | API and worker handling |
| Cancelling | Worker acknowledges | Cancelled | Release resources | Cleanup path |

Do not fill a missing row with the behavior you wish existed. Mark it inferred or absent from the inspected scope. For example, a late result after cancellation may be a valid outcome, a defect, or an undefined product decision depending on the actual contract.

## Interleavings and partial failure

Two lines in one function are not automatically one transition. Separate operations that another actor can observe between, including database commits, file renames, network sends, and asynchronous callbacks. A lock protects only actors that acquire the same lock; a transaction does not make an external notification atomic with its commit.

Trace short sequences such as claim → timeout → retry → original worker completes, or persist → crash → restart → notify again. Check idempotency, fencing, and which component has authority to accept a result. Distinguish at-most-once execution from at-most-once acceptance or side effects.

For interacting machines, inspect the cross-machine rule rather than every Cartesian-product state. A UI showing completion while durable work is still pending is a different kind of defect from a stuck worker.

## Invariants and progress

Safety says something bad never happens: two accepted results for one attempt, or a finalized object changing again. Progress says something good eventually happens: eligible work completes or reaches a reported failure. Time bounds, fair scheduling, availability, and retry assumptions matter for progress; tests of a few successful runs do not establish it generally.

A model-checked transition must correspond to the actual implementation’s atomicity. Replay a model counterexample against code when feasible. If the code does not reproduce it, investigate the model-to-code mapping before reporting a confirmed bug.

These model-correspondence and counterexample practices are also emphasized in pstack; see [source notes](../UPSTREAM.md). No pstack tooling is required by this skill.
