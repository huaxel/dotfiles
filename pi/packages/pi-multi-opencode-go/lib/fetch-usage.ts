import { fetchUsageApi } from "@juanbenjumea/opencode-go-usage/lib/usage-api.ts";
import type { AccountUsage, OpenCodeGoAccount } from "./types.ts";

/**
 * Fetch usage for one account via the official OpenCode Go usage API.
 * The API uses the same key as chat completions — no workspace cookie needed.
 */
export async function fetchAccountUsage(
  account: OpenCodeGoAccount,
): Promise<AccountUsage> {
  const result = await fetchUsageApi(account.key);
  return {
    account,
    rolling: result.rolling,
    weekly: result.weekly,
    monthly: result.monthly,
    fetchedAt: Date.now(),
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}
