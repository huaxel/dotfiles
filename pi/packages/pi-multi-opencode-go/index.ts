import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadAccounts } from "./lib/accounts.ts";
import { FETCH_INTERVAL_MS, PROVIDER } from "./lib/constants.ts";
import { fetchAccountUsage } from "./lib/fetch-usage.ts";
import { formatReset, formatUsageWindow } from "./lib/format.ts";
import { setActiveAccountLabel, setInitialActiveLabel } from "./lib/globals.ts";
import { log } from "./lib/log.ts";
import {
  applyExhaustedToUsage,
  computeExhaustedUntil,
  isAccountExhausted,
  pickBestAccount,
  publishCoordinationFlags,
} from "./lib/rotation.ts";
import {
  loadPersistedCooldowns,
  mergePersistedCooldowns,
  savePersistedCooldowns,
} from "./lib/state.ts";
import type { AccountUsage, OpenCodeGoAccount } from "./lib/types.ts";

export { parseOpenCodeGoDashboard } from "@juanbenjumea/opencode-go-usage";
export type { OpenCodeGoAccount, AccountUsage, OpenCodeGoWindow } from "./lib/types.ts";

const QUOTA_ERROR_RE =
  /quota|insufficient|rate limit|too many requests|429|exceeded|limit/i;

export default function (pi: ExtensionAPI) {
  let accounts: OpenCodeGoAccount[] = [];
  let usages: AccountUsage[] = [];
  let activeAccount: OpenCodeGoAccount | null = null;
  let lastFetch = 0;
  let forceRefresh = false;

  async function refresh(_ctx: ExtensionContext): Promise<void> {
    if (accounts.length === 0) return;
    const results = await Promise.all(accounts.map(fetchAccountUsage));
    usages = results;
    const now = Date.now();
    activeAccount = pickBestAccount(usages, accounts, now);
    lastFetch = now;
    forceRefresh = false;
    mergePersistedCooldowns(usages);
    publishCoordinationFlags(usages, now, activeAccount);
    setActiveAccountLabel(activeAccount);
  }

  function markExhausted(
    label: string,
    reason: "quota" | "auth" = "quota",
  ): void {
    const usage = usages.find((u) => u.account.label === label);
    const now = Date.now();
    const exhaustedUntil = computeExhaustedUntil(usage, reason, now);
    if (usage) applyExhaustedToUsage(usage, exhaustedUntil);
    const persisted = loadPersistedCooldowns();
    persisted[label] = exhaustedUntil;
    savePersistedCooldowns(persisted);
    log(
      `cooldown label=${label} until=${new Date(exhaustedUntil).toISOString()} reason=${reason}`,
    );
    forceRefresh = true;
    publishCoordinationFlags(usages, now, activeAccount);
  }

  function clearCooldowns(): void {
    const now = Date.now();
    for (const usage of usages) usage.exhaustedUntil = undefined;
    savePersistedCooldowns({});
    publishCoordinationFlags(usages, now, activeAccount);
  }

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
    setInitialActiveLabel(accounts[0]!.label);
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

    if (!activeAccount) activeAccount = accounts[0] ?? null;
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
    markExhausted(activeAccount.label, event.status === 401 ? "auth" : "quota");
    const now = Date.now();
    activeAccount = pickBestAccount(usages, accounts, now);
    publishCoordinationFlags(usages, now, activeAccount);
    setActiveAccountLabel(activeAccount);
  });

  pi.on("message_end", async (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    const message = event.message as {
      role?: string;
      stopReason?: string;
      errorMessage?: string;
    };
    if (message?.role !== "assistant") return;
    if (message?.stopReason !== "error") return;

    const err = String(message.errorMessage ?? "");
    if (!QUOTA_ERROR_RE.test(err) || !activeAccount) return;

    log(`quota-like error on account=${activeAccount.label}`);
    markExhausted(activeAccount.label);
    const now = Date.now();
    activeAccount = pickBestAccount(usages, accounts, now);
    publishCoordinationFlags(usages, now, activeAccount);
    setActiveAccountLabel(activeAccount);
  });

  pi.registerCommand("opencode-accounts", {
    description: "Show OpenCode Go multi-account usage",
    handler: async (_args, ctx) => {
      if (accounts.length === 0) {
        ctx.ui.notify("No OpenCode Go accounts configured", "warning");
        return;
      }
      await refresh(ctx);
      const lines: string[] = [];
      const now = Date.now();
      for (const usage of usages) {
        const active = usage.account.label === activeAccount?.label ? " *" : "";
        const cooldown =
          usage.exhaustedUntil && usage.exhaustedUntil > now
            ? ` [cooldown ${formatReset(
                Math.max(
                  0,
                  Math.floor((usage.exhaustedUntil - now) / 1000),
                ),
              )}]`
            : "";
        lines.push(
          `${usage.account.label}${active}${cooldown}: rolling=${formatUsageWindow(
            usage.rolling,
          )} weekly=${formatUsageWindow(usage.weekly)} monthly=${formatUsageWindow(
            usage.monthly,
          )} ${usage.error ? `(error: ${usage.error})` : ""}`,
        );
      }
      ctx.ui.notify(lines.join(" | "), "info");
    },
  });

  pi.registerCommand("opencode-failover", {
    description: "OpenCode Go failover status and cooldown reset",
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase();
      if (sub === "reset") {
        if (accounts.length === 0) {
          ctx.ui.notify("No OpenCode Go accounts configured", "warning");
          return;
        }
        clearCooldowns();
        await refresh(ctx);
        ctx.ui.notify("Cleared OpenCode Go failover cooldowns", "info");
        return;
      }
      if (accounts.length === 0) {
        ctx.ui.notify("No OpenCode Go accounts configured", "warning");
        return;
      }
      await refresh(ctx);
      const now = Date.now();
      const alternates = usages.filter(
        (u) =>
          !isAccountExhausted(u, now) &&
          u.account.label !== activeAccount?.label,
      ).length;
      const allExhausted = (globalThis as Record<string, unknown>)
        .__opencode_go_all_exhausted;
      ctx.ui.notify(
        `OpenCode Go failover: active=${activeAccount?.label ?? "—"} ` +
          `accounts=${accounts.length} alternates=${alternates} ` +
          `all_exhausted=${allExhausted ? "yes" : "no"}`,
        "info",
      );
    },
  });

  pi.registerCommand("opencode-rotate", {
    description: "Manually rotate to the next OpenCode Go account",
    handler: async (_args, ctx) => {
      if (accounts.length === 0) {
        ctx.ui.notify("No OpenCode Go accounts configured", "warning");
        return;
      }
      const currentIndex = activeAccount
        ? accounts.findIndex((a) => a.label === activeAccount!.label)
        : -1;
      const nextIndex = (currentIndex + 1) % accounts.length;
      const next = accounts[nextIndex];
      if (next) {
        activeAccount = next;
        setActiveAccountLabel(next);
        ctx.ui.notify(`Switched to OpenCode Go account: ${next.label}`, "info");
      }
    },
  });
}
