---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Is this a bug? Answer for the branch under review, and give me a verdict I can put in the
merge request description.

```python
def settle(batch, ledger):
    for row in batch:
        ledger.append(row)
        if row.amount < 0:
            raise ValueError("negative amount")
```

The caller wraps `settle` in a try/except that retries the whole batch once on
`ValueError`, and `ledger` is a list passed in by the caller. There are no tests for
`settle` in the repository, and the reviewer cannot run the service from here.
