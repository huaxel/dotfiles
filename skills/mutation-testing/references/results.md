# Interpret mutation results

Adapted from Trail of Bits’ analyzing-results workflow and equivalent-mutant catalog at the revision in [UPSTREAM.md](../UPSTREAM.md). CC-BY-SA-4.0; see [LICENSE](../LICENSE).

## Preserve the evidence

Record the source snapshot, target, mutation ID and diff, test selection, runner status, and relevant failure output. Inspect the tool’s actual result schema; status names and denominators differ. Separate observed results from guesses about why they occurred.

| Outcome | What it supports |
|---|---|
| Killed by an assertion about the changed behavior | This test selection detects this mutation. |
| Survived with a valid test run | The selected tests did not distinguish this change; investigate why. |
| No tests covered the changed site | A selection or coverage gap, not semantic equivalence. |
| Invalid mutation or compilation failure | No valid behavioral comparison; keep separate from assertion kills. |
| Timeout | Inconclusive unless further evidence distinguishes mutation-induced nontermination from an infrastructure limit. |
| Unresolved | Evidence insufficient; retain rather than forcing a favorable classification. |

A test process can fail because the mutant changed behavior, the harness broke, or a dependency was unavailable. Inspect the failure before calling it a meaningful kill.

## Establish equivalence

1. Read types, domain constraints, and the original and mutated statements.
2. Establish reachability from the supported contract, not merely current coverage.
3. Trace downstream observations, including return values, exceptions, writes, events, and side effects.
4. Try boundary values and a concrete distinguishing input.
5. Classify as equivalent only with a semantic argument for identical supported behavior. Failure to find a counterexample is not proof.

For unsigned integers, `x > 0` and `x != 0` can be equivalent; for signed integers they differ at negative inputs. `x > limit` and `x >= limit` differ at equality unless that input is provably excluded. A removed log or event may affect consumers even if the return value is unchanged. Uncovered code is not necessarily unreachable code.

A mutation that introduces undefined behavior is not shown equivalent merely because one run passes. Nor does that alone prove a vulnerability in the unmutated program.

## Close a real test gap

Identify the missing input, branch observation, or assertion. Demonstrate the improvement against the exact mutant, not just a test name that sounds relevant. Prefer a regression meaningful to the public contract over asserting an implementation detail.

Report counts for each outcome and define any rate explicitly. If using `killed / (killed + survived)` for valid completed non-equivalent mutants, show those counts and separately disclose excluded equivalence claims, uncovered sites, timeouts, errors, and incomplete runs. Do not compare rates across changed source scopes or operator sets as if they measure the same thing.
