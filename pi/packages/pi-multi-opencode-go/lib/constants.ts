export const PROVIDER = "opencode-go";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";

export const FETCH_INTERVAL_MS = 60_000;
export const MIN_COOLDOWN_MS = 5 * 60_000;
export const DEFAULT_COOLDOWN_MS = 60 * 60_000;
export const MAX_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
export const AUTH_ERROR_COOLDOWN_MS = 24 * 60 * 60_000;

export const AUTH_FAILOVER_KEY = "opencode-go-failover";
