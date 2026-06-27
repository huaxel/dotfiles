/**
 * Claude Pro bridge provider for pi.
 *
 * Registers a `claude` provider that routes through the local claude-bridge
 * (which shells out to `claude --print --model <id>`), so your Claude Pro
 * subscription works as a pi provider without an API key.
 *
 * Environment:
 *   CLAUDE_BRIDGE_URL     base URL of the bridge (default: http://100.116.127.30:7863)
 *   CLAUDE_BRIDGE_KEY     bearer token for the bridge (set this in your env/secrets)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BRIDGE_URL = (
  process.env.CLAUDE_BRIDGE_URL || "http://100.116.127.30:7863"
).replace(/\/$/, "");
const BRIDGE_KEY = process.env.CLAUDE_BRIDGE_KEY || "";

export default async function (pi: ExtensionAPI) {
  const res = await fetch(`${BRIDGE_URL}/v1/models`, {
    headers: BRIDGE_KEY ? { Authorization: `Bearer ${BRIDGE_KEY}` } : {},
  });
  if (!res.ok) {
    console.warn(
      `[claude-bridge] bridge returned ${res.status}${res.statusText ? ` ${res.statusText}` : ""}; provider registration skipped.`
    );
    return;
  }
  const payload = (await res.json()) as { data: Array<{ id: string }> };

  pi.registerProvider("claude", {
    name: "Claude Pro",
    baseUrl: `${BRIDGE_URL}/v1`,
    apiKey: BRIDGE_KEY || "claude-bridge",
    api: "openai-completions",
    models: payload.data.map((m) => ({
      id: m.id,
      name: m.id,
      reasoning: m.id.includes("sonnet") || m.id.includes("opus"),
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 8192,
      compat: {
        supportsDeveloperRole: false,
        supportsUsageInStreaming: false,
      },
    })),
  });
}
