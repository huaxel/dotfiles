/**
 * OpenCode Go Failover Extension
 *
 * Rotates across multiple OpenCode Go subscriptions so pi keeps working when
 * one account's quota window fills up.
 *
 * How it works:
 * - Reads account config from environment variables.
 * - Fetches each account's dashboard usage (rolling/weekly/monthly).
 * - Picks the account with the lowest rolling usage before each request.
 * - Overrides the `Authorization` header for the built-in `opencode-go` provider.
 * - If a request still fails with a quota-looking error, the account is marked
 *   exhausted for the session and the next turn re-fetches usage.
 *
 * Configuration (pick one):
 *
 * 1) Environment variables:
 *    set -x OPENCODE_API_KEY_1 "oc_..."
 *    set -x OPENCODE_GO_WORKSPACE_ID_1 "wrk_..."
 *    set -x OPENCODE_GO_AUTH_COOKIE_1 "Fe26.2**..."
 *    set -x OPENCODE_API_KEY_2 "oc_..."
 *    set -x OPENCODE_GO_WORKSPACE_ID_2 "wrk_..."
 *    set -x OPENCODE_GO_AUTH_COOKIE_2 "Fe26.2**..."
 *
 * 2) auth.json (`opencode-go-failover.accounts`). If an account omits
 *    `workspaceId`/`authCookie`, the extension falls back to
 *    `quota-status.opencode-go` (same config the obs footer uses).
 *
 * The built-in `opencode-go` provider still needs an API key configured in
 * auth.json (or the `OPENCODE_API_KEY` env var) so pi passes its auth check;
 * this extension overrides the actual `Authorization` header on every request.
 *
 * Commands:
 *   /opencode-accounts - Show usage for all configured accounts.
 *   /opencode-rotate   - Manually switch to the next account.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/* ───── Types ───── */

interface OpenCodeGoWindow {
  usagePercent: number;
  resetInSec: number;
}

interface OpenCodeGoAccount {
  key: string;
  workspaceId: string;
  authCookie: string;
  label: string;
}

interface AccountUsage {
  account: OpenCodeGoAccount;
  rolling: OpenCodeGoWindow | null;
  weekly: OpenCodeGoWindow | null;
  monthly: OpenCodeGoWindow | null;
  fetchedAt: number;
  error?: string;
  exhaustedAt?: number;
}

/* ───── Constants ───── */

const PROVIDER = "opencode-go";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";
const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const FETCH_INTERVAL_MS = 60_000;
const EXHAUSTED_COOLDOWN_MS = 5 * 60_000;

/* ───── Logging ───── */

const LOG_FILE = join(
  process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent"),
  "opencode-go-failover.log",
);

function log(message: string): void {
  try {
    appendFileSync(
      LOG_FILE,
      `${new Date().toISOString()} ${message}\n`,
      "utf-8",
    );
  } catch {
    // ignored
  }
}

/* ───── Auth / config resolution ───── */

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getAuthJsonPath(): string {
  const configDir =
    process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
  return join(configDir, "auth.json");
}

function loadAuthJson(): Record<string, any> {
  const path = getAuthJsonPath();
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8")) as Record<string, any>;
    }
  } catch {
    // ignored
  }
  return {};
}

function resolveValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("!")) {
    try {
      return (
        execFileSync("/bin/sh", ["-c", trimmed.slice(1)], {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 2000,
        }).trim() || undefined
      );
    } catch {
      return undefined;
    }
  }

  if (trimmed.startsWith("$$")) return trimmed.slice(1);
  if (trimmed.startsWith("$!")) return trimmed.slice(1);

  if (trimmed.startsWith("$")) {
    const name = trimmed.slice(1).replace(/^\{(.*)\}$/, "$1");
    return process.env[name];
  }

  return trimmed;
}

function loadAccountsFromEnv(): OpenCodeGoAccount[] {
  const accounts: OpenCodeGoAccount[] = [];
  for (let i = 1; i <= 8; i++) {
    const key = getEnv(`OPENCODE_API_KEY_${i}`);
    const workspaceId = getEnv(`OPENCODE_GO_WORKSPACE_ID_${i}`);
    const authCookie = getEnv(`OPENCODE_GO_AUTH_COOKIE_${i}`);
    const label = getEnv(`OPENCODE_GO_LABEL_${i}`) ?? `account-${i}`;
    if (!key || !workspaceId || !authCookie) continue;
    accounts.push({ key, workspaceId, authCookie, label });
  }
  return accounts;
}

async function loadAccountsFromAuthJson(): Promise<OpenCodeGoAccount[]> {
  const path = getAuthJsonPath();
  const auth = loadAuthJson();
  log(`auth.json path: ${path}, keys: ${Object.keys(auth).join(",")}`);

  const failover = auth["opencode-go-failover"];
  const fallbackQuota = auth["quota-status"]?.["opencode-go"] ?? {};
  const rawAccounts = Array.isArray(failover?.accounts) ? failover.accounts : [];
  log(`raw failover accounts: ${rawAccounts.length}`);

  const accounts: OpenCodeGoAccount[] = [];
  for (let i = 0; i < rawAccounts.length; i++) {
    const raw = rawAccounts[i];
    if (!raw || typeof raw !== "object") continue;
    const key = resolveValue(raw.key);
    const workspaceId =
      resolveValue(raw.workspaceId) ?? fallbackQuota.workspaceId ?? "";
    const authCookie =
      resolveValue(raw.authCookie) ?? fallbackQuota.authCookie ?? "";
    const label = String(raw.label || `account-${i + 1}`);
    log(`account ${label}: key=${key ? "set" : "missing"}, workspace=${workspaceId ? "set" : "missing"}, cookie=${authCookie ? "set" : "missing"}`);
    if (!key || !workspaceId || !authCookie) continue;
    accounts.push({ key, workspaceId, authCookie, label });
  }
  return accounts;
}

async function loadAccounts(): Promise<OpenCodeGoAccount[]> {
  const fromEnv = loadAccountsFromEnv();
  log(`env accounts: ${fromEnv.length}`);
  if (fromEnv.length > 0) return fromEnv;

  const fromAuth = await loadAccountsFromAuthJson();
  log(`auth.json accounts: ${fromAuth.length}`);
  return fromAuth;
}

/* ───── Usage parsing ───── */

function windowRegex(name: string): [RegExp, RegExp] {
  return [
    new RegExp(
      String.raw`${name}:\$R\[\d+\]=\{[^}]*usagePercent:${NUM}[^}]*resetInSec:${NUM}[^}]*\}`,
    ),
    new RegExp(
      String.raw`${name}:\$R\[\d+\]=\{[^}]*resetInSec:${NUM}[^}]*usagePercent:${NUM}[^}]*\}`,
    ),
  ];
}

const [RE_ROLLING_USAGE, RE_ROLLING_RESET] = windowRegex("rollingUsage");
const [RE_WEEKLY_USAGE, RE_WEEKLY_RESET] = windowRegex("weeklyUsage");
const [RE_MONTHLY_USAGE, RE_MONTHLY_RESET] = windowRegex("monthlyUsage");

function parseWindow(
  html: string,
  usageFirst: RegExp,
  resetFirst: RegExp,
): OpenCodeGoWindow | null {
  let match = usageFirst.exec(html);
  if (match) {
    const usagePercent = Number(match[1]);
    const resetInSec = Number(match[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }
  match = resetFirst.exec(html);
  if (match) {
    const resetInSec = Number(match[1]);
    const usagePercent = Number(match[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }
  return null;
}

function parseDashboard(html: string): {
  rolling: OpenCodeGoWindow | null;
  weekly: OpenCodeGoWindow | null;
  monthly: OpenCodeGoWindow | null;
} {
  return {
    rolling: parseWindow(html, RE_ROLLING_USAGE, RE_ROLLING_RESET),
    weekly: parseWindow(html, RE_WEEKLY_USAGE, RE_WEEKLY_RESET),
    monthly: parseWindow(html, RE_MONTHLY_USAGE, RE_MONTHLY_RESET),
  };
}

function isAuthenticatedUrl(url: string, workspaceId: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === "https://opencode.ai" &&
      parsed.pathname === `/workspace/${encodeURIComponent(workspaceId)}/go`
    );
  } catch {
    return false;
  }
}

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

async function fetchUsage(
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

    if (!isAuthenticatedUrl(response.url, account.workspaceId)) {
      return {
        account,
        rolling: null,
        weekly: null,
        monthly: null,
        fetchedAt: Date.now(),
        error: "auth-expired",
      };
    }

    const parsed = parseDashboard(html);
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

/* ───── Account selection ───── */

function effectivePercent(window: OpenCodeGoWindow | null): number {
  if (!window) return Infinity;
  return Number.isFinite(window.usagePercent) ? window.usagePercent : Infinity;
}

function isExhausted(usage: AccountUsage, now: number): boolean {
  if (usage.exhaustedAt && now - usage.exhaustedAt < EXHAUSTED_COOLDOWN_MS) {
    return true;
  }
  // Treat missing usage data as not-exhausted; let the request fail and retry.
  return false;
}

function scoreAccount(usage: AccountUsage, now: number): number[] {
  if (isExhausted(usage, now)) return [Infinity, Infinity, Infinity, Infinity];
  const r = effectivePercent(usage.rolling);
  const w = effectivePercent(usage.weekly);
  const m = effectivePercent(usage.monthly);
  // Prefer: rolling < 100%, then weekly < 100%, then monthly < 100%,
  // then lowest rolling, weekly, monthly percentages.
  return [r >= 100 ? 1 : 0, w >= 100 ? 1 : 0, m >= 100 ? 1 : 0, r, w, m];
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return (a[i] ?? Infinity) - (b[i] ?? Infinity);
  }
  return 0;
}

function pickAccount(
  usages: AccountUsage[],
  accounts: OpenCodeGoAccount[],
  now: number,
): OpenCodeGoAccount | null {
  if (usages.length > 0) {
    const sorted = [...usages].sort((u1, u2) =>
      compareScores(scoreAccount(u1, now), scoreAccount(u2, now)),
    );
    const best = sorted[0];
    if (best) return best.account;
  }
  return accounts[0] ?? null;
}

function formatReset(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d${remHours}h` : `${days}d`;
}

function formatUsage(
  window: OpenCodeGoWindow | null,
  fallback = "—",
): string {
  if (!window) return fallback;
  return `${window.usagePercent.toFixed(0)}% (${formatReset(
    window.resetInSec,
  )})`;
}

/* ───── Extension ───── */

export default function (pi: ExtensionAPI) {
  let accounts: OpenCodeGoAccount[] = [];
  let usages: AccountUsage[] = [];
  let activeAccount: OpenCodeGoAccount | null = null;
  let lastFetch = 0;
  let forceRefresh = false;

  async function refresh(ctx: ExtensionContext): Promise<void> {
    if (accounts.length === 0) return;
    const results = await Promise.all(accounts.map(fetchUsage));
    usages = results;
    activeAccount = pickAccount(usages, accounts, Date.now());
    lastFetch = Date.now();
    forceRefresh = false;
    updateActiveLabel();
  }

  function updateActiveLabel(): void {
    if (!activeAccount) return;
    const prevLabel = (globalThis as any).__opencode_go_active_label;
    (globalThis as any).__opencode_go_active_label = activeAccount.label;
    if (activeAccount.label !== prevLabel) {
      const trigger = (globalThis as any).__opencode_go_trigger_refresh;
      if (typeof trigger === "function") trigger();
    }
  }

  function markExhausted(label: string): void {
    const usage = usages.find((u) => u.account.label === label);
    if (usage) {
      usage.exhaustedAt = Date.now();
      // Bump rolling usage to 100% so proactive selection skips it.
      if (!usage.rolling) usage.rolling = { usagePercent: 100, resetInSec: 0 };
      else usage.rolling.usagePercent = Math.max(usage.rolling.usagePercent, 100);
    }
    forceRefresh = true;
  }

  /* ─── Lifecycle ─── */

  pi.on("session_start", async (_event, ctx) => {
    accounts = await loadAccounts();
    usages = [];
    activeAccount = null;
    lastFetch = 0;
    forceRefresh = false;
    if (accounts.length === 0) {
      log("no accounts configured");
      return;
    }
    log(`loaded ${accounts.length} account(s)`);
    // Set initial label immediately so other extensions (e.g. obs) can read it.
    (globalThis as any).__opencode_go_active_label = accounts[0]!.label;
    await refresh(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (accounts.length === 0) return;
    if (forceRefresh || Date.now() - lastFetch > FETCH_INTERVAL_MS) {
      await refresh(ctx);
    }
  });

  pi.on("before_provider_headers", async (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    if (accounts.length === 0) return;

    if (forceRefresh || Date.now() - lastFetch > FETCH_INTERVAL_MS) {
      await refresh(ctx);
    }

    if (!activeAccount) {
      activeAccount = accounts[0] ?? null;
    }
    if (!activeAccount) return;

    event.headers.Authorization = `Bearer ${activeAccount.key}`;
    log(`using account=${activeAccount.label}`);
  });

  pi.on("after_provider_response", async (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    if (!activeAccount) return;
    if (event.status !== 429 && event.status !== 401 && event.status !== 403) {
      return;
    }

    log(`HTTP ${event.status} on account=${activeAccount.label}`);
    markExhausted(activeAccount.label);
    activeAccount = pickAccount(usages, accounts, Date.now());
    updateActiveLabel();
  });

  pi.on("message_end", async (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    const message = event.message as any;
    if (message?.role !== "assistant") return;
    if (message?.stopReason !== "error") return;

    const err = String(message.errorMessage ?? "").toLowerCase();
    const looksQuota =
      err.includes("quota") ||
      err.includes("insufficient") ||
      err.includes("rate limit") ||
      err.includes("too many requests") ||
      err.includes("429") ||
      err.includes("exceeded") ||
      err.includes("limit");

    if (!looksQuota || !activeAccount) return;

    log(`quota-like error on account=${activeAccount.label}: ${err}`);
    markExhausted(activeAccount.label);

    // Pick next account immediately so the retry uses it.
    activeAccount = pickAccount(usages, accounts, Date.now());
    updateActiveLabel();
  });

  /* ─── Commands ─── */

  pi.registerCommand("opencode-accounts", {
    description: "Show OpenCode Go failover account usage",
    handler: async (_args, ctx) => {
      if (accounts.length === 0) {
        ctx.ui.notify("No opencode-go-failover accounts configured", "warning");
        return;
      }
      await refresh(ctx);
      const lines: string[] = [];
      for (const usage of usages) {
        const active = usage.account.label === activeAccount?.label ? " *" : "";
        const exhausted = usage.exhaustedAt ? " [exhausted]" : "";
        lines.push(
          `${usage.account.label}${active}${exhausted}: rolling=${formatUsage(
            usage.rolling,
          )} weekly=${formatUsage(usage.weekly)} monthly=${formatUsage(
            usage.monthly,
          )} ${usage.error ? `(error: ${usage.error})` : ""}`,
        );
      }
      ctx.ui.notify(lines.join(" | "), "info");
    },
  });

  pi.registerCommand("opencode-rotate", {
    description: "Manually rotate to the next OpenCode Go account",
    handler: async (_args, ctx) => {
      if (accounts.length === 0) {
        ctx.ui.notify("No opencode-go-failover accounts configured", "warning");
        return;
      }
      const currentIndex = activeAccount
        ? accounts.findIndex((a) => a.label === activeAccount!.label)
        : -1;
      const nextIndex = (currentIndex + 1) % accounts.length;
      const next = accounts[nextIndex];
      if (next) {
        activeAccount = next;
        updateActiveLabel();
        ctx.ui.notify(`Switched to OpenCode Go account: ${next.label}`, "info");
      }
    },
  });
}
