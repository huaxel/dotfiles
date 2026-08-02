import { fetchDashboardUsage } from "@juanbenjumea/opencode-go-usage/lib/fetch.ts";
import type { AccountUsage, OpenCodeGoAccount } from "./types.ts";

export async function fetchAccountUsage(
  account: OpenCodeGoAccount,
): Promise<AccountUsage> {
  const result = await fetchDashboardUsage(
    account.workspaceId,
    account.authCookie,
  );
  return {
    account,
    rolling: result.rolling,
    weekly: result.weekly,
    monthly: result.monthly,
    fetchedAt: Date.now(),
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}
