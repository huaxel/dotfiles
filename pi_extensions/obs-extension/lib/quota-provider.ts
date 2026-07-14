/**
 * Quota Provider — fetch subscription usage for the active pi provider.
 *
 * The visual footer owns presentation; this module owns provider-specific
 * fetching and normalization. Credentials come from existing pi auth/env
 * sources and are never included in errors or logs.
 *
 * Supported providers: Claude, Codex, opencode-go, ClinePass, and Umans.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/* ───── Types ───── */

export interface QuotaWindow {
  label: string;
  usedPercent: number;
  resetsIn?: string;
}

export interface QuotaSnapshot {
  provider: string;
  windows: QuotaWindow[];
  error?: string;
  fetchedAt: number;
}

export interface QuotaFetchOptions {
  /** Resolved by pi's model registry, when available. */
  apiKey?: string;
}

/* ───── Auth and safe helpers ───── */

type JsonObject = Record<string, any>;

function loadAuthJson(): JsonObject {
  const authPath = join(homedir(), ".pi", "agent", "auth.json");
  try {
    if (existsSync(authPath)) {
      return JSON.parse(readFileSync(authPath, "utf-8"));
    }
  } catch {
    // Missing or malformed auth should render as unavailable, not break pi.
  }
  return {};
}

function resolveAuthValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("!")) {
    try {
      return execFileSync("/bin/sh", ["-c", trimmed.slice(1)], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 2000,
      }).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed) && process.env[trimmed]) {
    return process.env[trimmed];
  }

  return trimmed;
}

function authCredential(...keys: string[]): string | undefined {
  const auth = loadAuthJson();
  for (const key of keys) {
    const entry = auth[key];
    if (typeof entry === "string") {
      const value = resolveAuthValue(entry);
      if (value) return value;
      continue;
    }
    if (entry && typeof entry === "object") {
      for (const field of ["access", "key", "token", "refresh"]) {
        const value = resolveAuthValue(entry[field]);
        if (value) return value;
      }
    }
  }
  return undefined;
}

function formatResetTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "now";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours < 24) return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `${days}d${rem}h` : `${days}d`;
}

function formatResetSeconds(seconds: number): string | undefined {
  if (!Number.isFinite(seconds)) return undefined;
  return formatResetTime(new Date(Date.now() + Math.max(0, seconds) * 1000));
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 10_000): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { response, data: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value <= 1 && value >= 0 ? value * 100 : value;
  return clampPercent(normalized);
}

function safeError(error: unknown): string {
  if (error instanceof Error && /^HTTP \d+$/.test(error.message)) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  return "unavailable";
}

/* ───── Provider mapping ───── */

const PROVIDER_MAP: Record<string, string> = {
  anthropic: "claude",
  "claude-bridge": "claude",
  "openai-codex": "codex",
  opencode: "opencode-go",
  "opencode-go": "opencode-go",
  "cline-pass": "cline-pass",
  umans: "umans",
};

/* ───── Claude ───── */

async function fetchClaudeUsage(): Promise<QuotaSnapshot> {
  let token = authCredential("anthropic");

  if (!token) {
    try {
      const keychain = execFileSync(
        "/usr/bin/security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 2000 },
      ).trim();
      const parsed = JSON.parse(keychain);
      token = parsed.claudeAiOauth?.accessToken;
    } catch {
      // No Claude CLI credential.
    }
  }

  if (!token) return { provider: "Claude", windows: [], error: "no-auth", fetchedAt: Date.now() };

  try {
    const { data } = await fetchJson("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
    const windows: QuotaWindow[] = [];
    const addWindow = (source: any, label: string) => {
      if (source?.utilization === undefined) return;
      windows.push({
        label,
        usedPercent: normalizePercent(Number(source.utilization)),
        resetsIn: source.resets_at ? formatResetTime(new Date(source.resets_at)) : undefined,
      });
    };

    addWindow(data.five_hour, "5h");
    addWindow(data.seven_day, "Week");
    // Some subscription variants expose a monthly bucket; do not synthesize
    // one when the endpoint omits it.
    addWindow(data.monthly ?? data.thirty_day ?? data.thirty_day_window, "Month");

    return { provider: "Claude", windows, fetchedAt: Date.now() };
  } catch (error) {
    return { provider: "Claude", windows: [], error: safeError(error), fetchedAt: Date.now() };
  }
}

/* ───── OpenAI Codex ───── */

async function fetchCodexUsage(): Promise<QuotaSnapshot> {
  let token = authCredential("openai-codex");
  let accountId = loadAuthJson()["openai-codex"]?.accountId;

  if (!token) {
    const codexPath = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json");
    try {
      const data = JSON.parse(readFileSync(codexPath, "utf-8"));
      token = data.OPENAI_API_KEY || data.tokens?.access_token;
      accountId ||= data.tokens?.account_id;
    } catch {
      // No Codex credential.
    }
  }

  if (!token) return { provider: "Codex", windows: [], error: "no-auth", fetchedAt: Date.now() };

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "pi-agent",
      Accept: "application/json",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;

    const { data } = await fetchJson("https://chatgpt.com/backend-api/wham/usage", {
      headers,
    });
    const windows: QuotaWindow[] = [];

    const rateLimit = data.rate_limit ?? {};
    for (const [label, window] of [
      ["5h", rateLimit.primary_window],
      ["Week", rateLimit.secondary_window],
      ["Month", rateLimit.monthly_window ?? rateLimit.tertiary_window],
    ] as const) {
      if (!window) continue;
      const resetAt = typeof window.reset_at === "number" ? new Date(window.reset_at * 1000) : undefined;
      windows.push({
        label,
        usedPercent: clampPercent(Number(window.used_percent ?? 0)),
        resetsIn: resetAt ? formatResetTime(resetAt) : formatResetSeconds(Number(window.reset_after_seconds)),
      });
    }

    return { provider: "Codex", windows, fetchedAt: Date.now() };
  } catch (error) {
    return { provider: "Codex", windows: [], error: safeError(error), fetchedAt: Date.now() };
  }
}

/* ───── opencode-go (ported from pi-quota-status) ───── */

interface OpenCodeGoWindow {
  usagePercent: number;
  resetInSec: number;
}

const OPENCODE_GO_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";
const OPENCODE_GO_NUM = String.raw`(-?\d+(?:\.\d+)?)`;

function opencodeGoWindowRegex(name: string): [RegExp, RegExp] {
  return [
    new RegExp(String.raw`${name}:\$R\[\d+\]=\{[^}]*usagePercent:${OPENCODE_GO_NUM}[^}]*resetInSec:${OPENCODE_GO_NUM}[^}]*\}`),
    new RegExp(String.raw`${name}:\$R\[\d+\]=\{[^}]*resetInSec:${OPENCODE_GO_NUM}[^}]*usagePercent:${OPENCODE_GO_NUM}[^}]*\}`),
  ];
}

const [RE_ROLLING_USAGE, RE_ROLLING_RESET] = opencodeGoWindowRegex("rollingUsage");
const [RE_WEEKLY_USAGE, RE_WEEKLY_RESET] = opencodeGoWindowRegex("weeklyUsage");
const [RE_MONTHLY_USAGE, RE_MONTHLY_RESET] = opencodeGoWindowRegex("monthlyUsage");

function parseOpenCodeGoWindow(html: string, usageFirst: RegExp, resetFirst: RegExp): OpenCodeGoWindow | null {
  let match = usageFirst.exec(html);
  if (match) {
    const usagePercent = Number(match[1]);
    const resetInSec = Number(match[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) return { usagePercent, resetInSec };
  }

  match = resetFirst.exec(html);
  if (match) {
    const resetInSec = Number(match[1]);
    const usagePercent = Number(match[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) return { usagePercent, resetInSec };
  }

  return null;
}

export function parseOpenCodeGoDashboard(html: string): {
  rolling: OpenCodeGoWindow | null;
  weekly: OpenCodeGoWindow | null;
  monthly: OpenCodeGoWindow | null;
} {
  return {
    rolling: parseOpenCodeGoWindow(html, RE_ROLLING_USAGE, RE_ROLLING_RESET),
    weekly: parseOpenCodeGoWindow(html, RE_WEEKLY_USAGE, RE_WEEKLY_RESET),
    monthly: parseOpenCodeGoWindow(html, RE_MONTHLY_USAGE, RE_MONTHLY_RESET),
  };
}

async function fetchOpencodeGoUsage(): Promise<QuotaSnapshot> {
  const config = loadAuthJson()["quota-status"]?.["opencode-go"];
  const workspaceId = typeof config?.workspaceId === "string" ? config.workspaceId.trim() : "";
  const authCookie = typeof config?.authCookie === "string" ? config.authCookie.trim() : "";
  if (!workspaceId || !authCookie) {
    return { provider: "opencode-go", windows: [], error: "no-auth", fetchedAt: Date.now() };
  }

  try {
    const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`;
    const { response, data: html } = await fetchJsonText(url, {
      headers: { Cookie: `auth=${authCookie}`, "User-Agent": OPENCODE_GO_USER_AGENT },
    });
    if (!isAuthenticatedOpencodeUrl(response.url, workspaceId)) {
      return { provider: "opencode-go", windows: [], error: "auth-expired", fetchedAt: Date.now() };
    }

    const parsed = parseOpenCodeGoDashboard(html);
    const windows: QuotaWindow[] = [];
    if (parsed.rolling) {
      windows.push({
        label: "5h",
        usedPercent: clampPercent(parsed.rolling.usagePercent),
        resetsIn: formatResetSeconds(parsed.rolling.resetInSec),
      });
    }
    if (parsed.weekly) {
      windows.push({
        label: "Week",
        usedPercent: clampPercent(parsed.weekly.usagePercent),
        resetsIn: formatResetSeconds(parsed.weekly.resetInSec),
      });
    }
    if (parsed.monthly) {
      windows.push({
        label: "Month",
        usedPercent: clampPercent(parsed.monthly.usagePercent),
        resetsIn: formatResetSeconds(parsed.monthly.resetInSec),
      });
    }

    return { provider: "opencode-go", windows, fetchedAt: Date.now() };
  } catch (error) {
    return { provider: "opencode-go", windows: [], error: safeError(error), fetchedAt: Date.now() };
  }
}

async function fetchJsonText(url: string, init: RequestInit, timeoutMs = 10_000): Promise<{ response: Response; data: string }> {
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

function isAuthenticatedOpencodeUrl(url: string, workspaceId: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://opencode.ai" &&
      parsed.pathname === `/workspace/${encodeURIComponent(workspaceId)}/go`;
  } catch {
    return false;
  }
}

/* ───── ClinePass ───── */

interface ClineUsageItem {
  createdAt?: string;
  costUsd?: number;
}

const CLINE_BASE_URL = "https://api.cline.bot";
const CLINE_PAGE_LIMIT = 100;
const CLINE_MAX_PAGES = 100;
function clineUrl(path: string): string {
  const base = process.env.CLINE_API_BASE?.trim() || CLINE_BASE_URL;
  try {
    const parsed = new URL(base);
    parsed.protocol = "https:";
    return new URL(path, `${parsed.protocol}//${parsed.host}`).toString();
  } catch {
    return new URL(path, CLINE_BASE_URL).toString();
  }
}

function clineApiKey(explicit?: string): string | undefined {
  return explicit || resolveAuthValue(process.env.CLINE_API_KEY) || authCredential("cline-pass", "clinepass");
}

function parseClineDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function clineWindow(
  now: number,
  label: string,
  durationMs: number,
  limitUnits: number,
  items: ClineUsageItem[],
): QuotaWindow {
  const start = now - durationMs;
  let usedUnits = 0;
  let oldest: number | undefined;

  for (const item of items) {
    const createdAt = parseClineDate(item.createdAt)?.getTime();
    if (createdAt === undefined || createdAt < start || createdAt > now) continue;
    const cost = Number(item.costUsd);
    if (Number.isFinite(cost)) usedUnits += cost;
    oldest = oldest === undefined ? createdAt : Math.min(oldest, createdAt);
  }

  const usedPercent = limitUnits > 0 ? clampPercent((usedUnits / limitUnits) * 100) : 0;
  const resetAt = oldest === undefined ? undefined : new Date(oldest + durationMs);
  return { label, usedPercent, resetsIn: resetAt ? formatResetTime(resetAt) : undefined };
}

async function fetchClineUsage(apiKey: string): Promise<QuotaSnapshot> {
  try {
    const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "User-Agent": "pi-obs-footer" };
    const me = await fetchJson(clineUrl("/api/v1/users/me"), { headers });
    const userId = typeof me.data?.data?.id === "string" ? me.data.data.id : "";
    if (!userId) return { provider: "ClinePass", windows: [], error: "invalid-response", fetchedAt: Date.now() };

    const plans = await fetchJson(clineUrl("/api/v1/plans"), { headers });
    const planList = Array.isArray(plans.data?.data) ? plans.data.data : [];
    const threshold = planList.find((plan: any) =>
      plan?.isActive && plan?.entitlements?.cline_pass?.enabled && plan?.entitlements?.cline_pass?.inferenceCapThreshold,
    )?.entitlements?.cline_pass?.inferenceCapThreshold;
    if (!threshold) return { provider: "ClinePass", windows: [], error: "no-active-plan", fetchedAt: Date.now() };

    const items: ClineUsageItem[] = [];
    let cursor = "";
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (let page = 0; page < CLINE_MAX_PAGES; page++) {
      const url = new URL(clineUrl(`/api/v1/users/${encodeURIComponent(userId)}/usages`));
      url.searchParams.set("limit", String(CLINE_PAGE_LIMIT));
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetchJson(url.toString(), { headers });
      const data = response.data?.data;
      const pageItems = Array.isArray(data?.items) ? data.items : [];
      items.push(...pageItems);

      const oldest = pageItems
        .map((item: ClineUsageItem) => parseClineDate(item.createdAt)?.getTime())
        .filter((value: number | undefined): value is number => value !== undefined)
        .reduce((min: number | undefined, value: number) => min === undefined ? value : Math.min(min, value), undefined);
      cursor = typeof data?.nextToken === "string" ? data.nextToken.trim() : "";
      if (!cursor || pageItems.length === 0 || (oldest !== undefined && oldest < cutoff)) break;
    }

    const now = Date.now();
    return {
      provider: "ClinePass",
      windows: [
        clineWindow(now, "5h", 5 * 60 * 60 * 1000, Number(threshold.last5HoursUsageCostUSDPerUser), items),
        clineWindow(now, "Week", 7 * 24 * 60 * 60 * 1000, Number(threshold.last7daysUsageCostUSDPerUser), items),
        clineWindow(now, "Month", 30 * 24 * 60 * 60 * 1000, Number(threshold.last30daysUsageCostUSDPerUser), items),
      ],
      fetchedAt: now,
    };
  } catch (error) {
    return { provider: "ClinePass", windows: [], error: safeError(error), fetchedAt: Date.now() };
  }
}

/* ───── Umans ───── */

async function fetchUmansUsage(apiKey?: string): Promise<QuotaSnapshot> {
  const key = apiKey || resolveAuthValue(process.env.UMANS_API_KEY) || authCredential("umans");
  if (!key) return { provider: "Umans", windows: [], error: "no-auth", fetchedAt: Date.now() };

  try {
    const configuredBaseUrl = process.env.UMANS_BASE_URL?.trim() || "https://api.code.umans.ai";
    const parsedBaseUrl = new URL(configuredBaseUrl);
    if (parsedBaseUrl.protocol !== "https:") {
      return { provider: "Umans", windows: [], error: "invalid-config", fetchedAt: Date.now() };
    }
    const baseUrl = parsedBaseUrl.toString().replace(/\/$/, "");
    const { data } = await fetchJson(`${baseUrl}/v1/usage`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "pi-obs-footer" },
    });
    const windows: QuotaWindow[] = [];
    const requestLimit = Number(data.limits?.requests?.limit);
    const requestsUsed = Number(data.usage?.requests_in_window);
    if (Number.isFinite(requestLimit) && requestLimit > 0 && Number.isFinite(requestsUsed)) {
      windows.push({ label: "Req", usedPercent: clampPercent((requestsUsed / requestLimit) * 100) });
    }

    const concurrencyLimit = Number(data.limits?.concurrency?.limit);
    const concurrencyUsed = Number(data.usage?.concurrent_sessions);
    if (Number.isFinite(concurrencyLimit) && concurrencyLimit > 0 && Number.isFinite(concurrencyUsed)) {
      windows.push({ label: "Conc", usedPercent: clampPercent((concurrencyUsed / concurrencyLimit) * 100) });
    }

    return { provider: "Umans", windows, fetchedAt: Date.now() };
  } catch (error) {
    return { provider: "Umans", windows: [], error: safeError(error), fetchedAt: Date.now() };
  }
}

/* ───── Dispatch and cache ───── */

const FETCHERS: Record<string, (options: QuotaFetchOptions) => Promise<QuotaSnapshot>> = {
  claude: async () => fetchClaudeUsage(),
  codex: async () => fetchCodexUsage(),
  "opencode-go": async () => fetchOpencodeGoUsage(),
  "cline-pass": async (options) => {
    const key = clineApiKey(options.apiKey);
    return key ? fetchClineUsage(key) : { provider: "ClinePass", windows: [], error: "no-auth", fetchedAt: Date.now() };
  },
  umans: async (options) => fetchUmansUsage(options.apiKey),
};

const cache = new Map<string, QuotaSnapshot>();
const CACHE_TTL = 5 * 60_000;

export function detectProvider(piProvider: string): string | null {
  return PROVIDER_MAP[piProvider] || null;
}

export async function fetchQuota(piProvider: string, options: QuotaFetchOptions = {}): Promise<QuotaSnapshot | null> {
  const key = detectProvider(piProvider);
  if (!key) return null;

  // Only cache requests whose effective credential is supplied by the caller.
  // Providers that resolve credentials internally may switch accounts while pi
  // is running, so a provider-only cache key could show another account's data.
  const cacheKey = options.apiKey
    ? `${key}:${createHash("sha256").update(options.apiKey).digest("hex").slice(0, 16)}`
    : null;
  const cached = cacheKey ? cache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;

  const fetcher = FETCHERS[key];
  if (!fetcher) return null;
  const result = await fetcher(options);
  if (cacheKey) cache.set(cacheKey, result);
  return result;
}
