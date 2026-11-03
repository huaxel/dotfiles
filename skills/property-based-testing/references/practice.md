# Strategies and counterexamples

Adapted and condensed from Trail of Bits’ generating, reviewing, interpreting-failures, and refactoring references at the revision in [UPSTREAM.md](../UPSTREAM.md). CC-BY-SA-4.0; see [LICENSE](../LICENSE).

## Generator design

- Encode constraints in generators rather than discarding most generated inputs. For an index/list pair, generate a nonempty list first and choose an index within its bounds.
- Generate fields with dependencies together. For stateful systems, model legal transitions and verify the invariant after each step.
- Include empty/singleton inputs, duplicate values, Unicode, minimum/maximum bounds, invalid encodings, and numeric edge cases where the contract permits them. Do not assume every type annotation expresses the complete domain.
- Invalid-input tests should verify a specific error contract, not catch every exception. Unexpected exceptions and hangs are findings.
- Use a measured case count and per-run timeout. Slow tests may need a different library deadline, not the removal of all runtime bounds. Check the installed version before relying on settings or CLI flags.
- Preserve minimized inputs, seeds or replay paths, dependency versions, and relevant environment constraints. Add a stable example regression when possible; seeds alone may not reproduce across library versions.

## Checks that assert little

`result == result` usually asserts nothing. Two independent calls can test determinism when nondeterminism is plausible, but do not replace an independently grounded correctness property with determinism alone.

`assert add(a, b) == a + b` can simply repeat the implementation. Prefer independent examples, constraints, and relevant algebraic properties. Idempotence alone is insufficient for a normalizer: a constant function is also idempotent. Ordering alone is insufficient for sorting: returning an empty sequence is ordered. Combine complementary guarantees.

A high discard count, a property that never reaches its assertion, or a generator confined to one trivial value needs investigation. Do not suppress health checks instead of fixing the domain model.

## Failure classification

| Evidence | Classification | Next step |
|---|---|---|
| Supported input violates a documented guarantee | Implementation defect | Minimize, retain a regression, and fix within scope. |
| Input violates a precondition | Strategy defect | Constrain the generator; keep invalid-input coverage separately. |
| Assertion invents a guarantee | Property defect | Correct the property, not the implementation. |
| Contract does not settle the edge case | Ambiguity | State alternatives; ask only if the choice blocks the task. |
| Failure depends on shared state, real time, or unavailable infrastructure | Harness/environment issue | Isolate and reproduce before attributing it to product code. |

Report findings locally. A valid counterexample does not authorize filing upstream issues or PRs.
