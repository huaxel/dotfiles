import { USER_AGENT } from "./constants.ts";
import {
  isAuthenticatedWorkspaceUrl,
  parseOpenCodeGoDashboard,
} from "@juanbenjumea/opencode-go-usage/lib/dashboard.ts";
import type { AccountUsage, OpenCodeGoAccount } from "./types.ts";

async function fetchText(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<{ response: Response; data: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { response, data: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAccountUsage(
  account: OpenCodeGoAccount,
): Promise<AccountUsage> {
  try {
    const url = `https://opencode.ai/workspace/${encodeURIComponent(
      account.workspaceId,
    )}/go`;
    const { response, data: html } = await fetchText(url, {
      headers: {
        Cookie: `auth=${account.authCookie}`,
        "User-Agent": USER_AGENT,
      },
    });

    if (!isAuthenticatedWorkspaceUrl(response.url, account.workspaceId)) {
      return {
        account,
        rolling: null,
        weekly: null,
        monthly: null,
        fetchedAt: Date.now(),
        error: "auth-expired",
      };
    }

    const parsed = parseOpenCodeGoDashboard(html);
    return {
      account,
      rolling: parsed.rolling,
      weekly: parsed.weekly,
      monthly: parsed.monthly,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    return {
      account,
      rolling: null,
      weekly: null,
      monthly: null,
      fetchedAt: Date.now(),
      error: message,
    };
  }
}
