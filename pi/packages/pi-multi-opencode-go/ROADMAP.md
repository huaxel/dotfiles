# Roadmap

- Pre-stream retry when Pi exposes provider-level retry hooks that re-run header injection
- ~~Auto-continue after account switch (safe queued user prompt)~~ — **implemented 2026-08-02** (spike + prototype):
  - Session API confirmed: `pi.sendUserMessage(msg, { deliverAs: "steer" | "followUp" })` always triggers a turn; `agent_settled` fires only after pi's own retry/compaction/queued-continuation chains settle; `ctx.isIdle()` guards busy state.
  - Pi already auto-retries error-stop turns in-process (default 3 retries, 2s base delay), and `before_provider_headers` re-injects the switched account's token per request — so this extension-level path is the **last resort** after pi's retry budget is spent.
  - Guards: arm only on quota/auth error paths that switch accounts; fire at most once per run (flag consumed synchronously at `agent_settled`); skip when `__opencode_go_all_exhausted` (no alternate → would loop); nudge-style prompt ("retry your last request, continuing from current state") instead of replaying the original user text (avoids tool side-effect duplication).
  - Smoke test: **verified live 2026-08-02** — `/opencode-autocontinue-test` armed at 12:57:11 (turn=0), next settled turn queued the retry at 12:59:53 (`auto-continue turn=16: queueing retry prompt`), and the prompt arrived as a real user turn that woke the agent. `/opencode-autocontinue-test status` shows state; log lines live in `pi/agent/opencode-go-failover.log`.
- Wait for earliest reset when all accounts are on cooldown (overnight resume)
- Optional dedup of identical API keys across accounts
- Share `fetchAccountUsage` with footer via documented imports (partially done via `@juanbenjumea/opencode-go-usage`)
