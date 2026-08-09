## Question

What reliability issues are revealed by the pi-crash.log and opencode-go-failover.log? Investigate:

1. The pi-crash.log (204K) shows only 1 recorded crash headline but 1432 lines of terminal output — what's the actual failure mode?
2. The opencode-go-failover.log (472K, 10157 lines) shows repeated auth checks and at least one quota-related failover event — what's the failover pattern and frequency?
3. Are there repeated error patterns indicating systemic issues (provider quota exhaustion, auth failures, memory issues)?
4. What's the impact on session reliability?

Deliverable: A categorized summary of failure modes and frequencies, plus recommendations for mitigation.
