import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { AUTH_FAILOVER_KEY } from "./constants.ts";
import { getAuthJsonPath } from "./agent-dir.ts";
import { log } from "./log.ts";
import type { OpenCodeGoAccount } from "./types.ts";

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function loadAuthJson(): Record<string, unknown> {
  const path = getAuthJsonPath();
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    }
  } catch {
    // ignored
  }
  return {};
}

/** Resolve auth.json string values ($ENV, $$literal, optional !shell for power users). */
export function resolveAuthValue(value: unknown): string | undefined {
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

export function loadAccountsFromEnv(): OpenCodeGoAccount[] {
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

export async function loadAccountsFromAuthJson(): Promise<OpenCodeGoAccount[]> {
  const path = getAuthJsonPath();
  const auth = loadAuthJson();
  log(`auth.json path: ${path}, keys: ${Object.keys(auth).join(",")}`);

  const failover = auth[AUTH_FAILOVER_KEY] as Record<string, unknown> | undefined;
  const quotaStatus = auth["quota-status"] as Record<string, unknown> | undefined;
  const fallbackQuota =
    (quotaStatus?.["opencode-go"] as Record<string, unknown>) ?? {};
  const rawAccounts = Array.isArray(failover?.accounts) ? failover.accounts : [];
  log(`raw failover accounts: ${rawAccounts.length}`);

  const accounts: OpenCodeGoAccount[] = [];
  for (let i = 0; i < rawAccounts.length; i++) {
    const raw = rawAccounts[i];
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const key = resolveAuthValue(row.key);
    const workspaceId =
      resolveAuthValue(row.workspaceId) ??
      (fallbackQuota.workspaceId as string | undefined) ??
      "";
    const authCookie =
      resolveAuthValue(row.authCookie) ??
      (fallbackQuota.authCookie as string | undefined) ??
      "";
    const label = String(row.label || `account-${i + 1}`);
    log(
      `account ${label}: key=${key ? "set" : "missing"}, workspace=${workspaceId ? "set" : "missing"}, cookie=${authCookie ? "set" : "missing"}`,
    );
    if (!key || !workspaceId || !authCookie) continue;
    accounts.push({ key, workspaceId, authCookie, label });
  }
  return accounts;
}

export async function loadAccounts(): Promise<OpenCodeGoAccount[]> {
  const fromEnv = loadAccountsFromEnv();
  log(`env accounts: ${fromEnv.length}`);
  if (fromEnv.length > 0) return fromEnv;

  const fromAuth = await loadAccountsFromAuthJson();
  log(`auth.json accounts: ${fromAuth.length}`);
  return fromAuth;
}
