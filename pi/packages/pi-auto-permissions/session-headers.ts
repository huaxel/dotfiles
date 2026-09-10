import type { ProviderHeaders } from "@earendil-works/pi-ai";

export function buildReviewerHeaders(
  provider: string | undefined,
  sessionId: string,
  authHeaders: ProviderHeaders | undefined,
): ProviderHeaders {
  const headers = { ...(authHeaders ?? {}) };
  if (provider === "opencode" || provider === "opencode-go") {
    headers["x-opencode-session"] = sessionId;
    headers["x-opencode-client"] = "pi";
  }
  return headers;
}
