# 30-Day Roadmap

> **Status: window elapsed.** This roadmap covered 2026-08-10 → 2026-09-09.
> The one-sentence framing and measures below remain useful as standing
> guidance; the dated weekly phases are historical. See `FEEDBACK.md` for
> what actually happened and `PLAN.md` for the current pi-health-check map.

The goal is not more agent power. It is more finished work with a named user.

## This week: stop the leaks

### Drop

- No tooling change without a linked deliverable, user, and ship date. (Evidence: Interview Q5; 747 agent-tooling messages; 173 automation messages.)
- No default second review. It happens only when the verification packet finds a risk or failed check. (Evidence: Interview Q4; 673 review messages.)
- No parallel pane without a status and closeout state.

### Install

Create a delivery ledger with these fields:

```text
task | repository | owner | user | outcome | PR | shipped_at | state
```

Allowed states: `shipped`, `merged`, `in_review`, `blocked`, `abandoned`, `open`.

First action: add the ledger entry before starting the next agent task.

## Days 4–10: delegate verification

Build one bounded verification command that:

1. reads the changed files;
2. runs the relevant tests and CI checks;
3. runs security and regression checks;
4. reports failures, uncertainty, and a release recommendation;
5. returns a nonzero status when evidence is missing.

This replaces the current review → another review → CI loop. (Evidence: review 673; testing 722; security 200; Interview Q4.)

First action: use it on the next PR before asking for another review.

## Days 11–17: delegate closure

Make the agent update the delivery ledger from PR, merge, deployment, and explicit user information. It must refuse to mark work shipped without `user` and `shipped_at`.

(Evidence: Interview Q2; 148 deployment/release/publish/ship keyword hits without reliable task-to-user linkage.)

First action: close the next three tasks through the ledger, even if their state is `blocked` or `abandoned`.

## Days 18–24: use parallelism for output

Keep Herdr panes and worktrees. Add a closeout report to every pane:

```text
state: shipped | merged | in_review | blocked | abandoned | open
next_action:
blocked_reason:
ledger_id:
```

(Evidence: Interview Q5; 5,488 Pi session files; 747 agent-tooling messages.)

First action: require this report before merging or opening another parallel task.

## Days 25–30: protect the human work

Keep two decisions for yourself:

1. define the user, outcome, and acceptance bar;
2. choose the irreversible architecture or product tradeoff.

(Evidence: Interview Q2 and Q3; security 200; performance 143.)

First action: begin every task with one sentence:

> This is shipped when ___ uses ___ by ___, and it passes ___ .

## Daily rhythm

- **12:00–16:00:** dispatch, review packets, CI, ledger maintenance.
- **18:00–21:00:** one deep-work deliverable. No new tooling.
- **End of block:** record shipped, merged, blocked, abandoned, or open.

Pi session starts cluster at 18:00–21:00: 361, 352, 394, and 380 sessions respectively. (Evidence: `evidence.md`, rhythm metadata.) The archive does not identify spirals, so no stronger claim is made.

## Measures after 30 days

Track only these:

- tasks shipped to a named user;
- tasks merged but not shipped;
- median review rounds per task;
- hours spent on tooling without a linked delivery;
- open tasks older than seven days.

Success is not a larger agent system. Success is fewer tasks in `merged`, `in_review`, and `open`, and more tasks in `shipped`.
