export const PROVIDER = "opencode-go";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";

export const FETCH_INTERVAL_MS = 60_000;
export const MIN_COOLDOWN_MS = 5 * 60_000;
export const DEFAULT_COOLDOWN_MS = 60 * 60_000;
export const MAX_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
export const AUTH_ERROR_COOLDOWN_MS = 24 * 60 * 60_000;

export const AUTH_FAILOVER_KEY = "opencode-go-failover";

// Auto-continue after an in-turn account switch (ROADMAP item 6 spike).
// When a quota/auth error kills a turn and the extension switches accounts,
// queue a safe retry prompt once the run has fully settled (agent_settled)
// so the user's request completes without re-typing. Only fires when an
// alternate account is available; pi's own auto-retry (default 3 retries)
// normally re-runs the turn first, so this is the last-resort path.
export const AUTO_CONTINUE_ENABLED = true;
export const AUTO_CONTINUE_PROMPT =
  "(auto-continue) The previous turn failed with a usage-limit error and the provider account was switched. Please retry your last request, continuing from the current conversation state without repeating work already done.";

// Overnight resume: when ALL accounts are on cooldown, wait for the earliest
// reset and fire one safe retry (same nudge style as auto-continue).
export const RESUME_PROMPT =
  "(auto-resume) All OpenCode Go accounts were on cooldown and the earliest has now reset. Please retry your last request, continuing from the current conversation state without repeating work already done.";
export const RESUME_GRACE_MS = 5_000;
