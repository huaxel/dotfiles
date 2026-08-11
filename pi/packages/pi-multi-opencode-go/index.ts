import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadAccounts } from "./lib/accounts.ts";
import {
  AUTO_CONTINUE_ENABLED,
  AUTO_CONTINUE_PROMPT,
  FETCH_INTERVAL_MS,
  PROVIDER,
  RESUME_GRACE_MS,
  RESUME_PROMPT,
} from "./lib/constants.ts";
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
import { computeEarliestReset, createResumeScheduler } from "./lib/resume.ts";
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

/** Test seam: injectable timer/clock for the resume scheduler. */
export interface ResumeSchedulerDeps {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export default function (
  pi: ExtensionAPI,
  deps: ResumeSchedulerDeps = {},
) {
  // ── Read-only quota & cost snapshot for model-choice decisions ──
  pi.registerTool({
    name: "opencode_usage",
    label: "OpenCode Usage",
    description:
      "Read-only OpenCode Go quota and cost snapshot: per-account usage windows (rolling/weekly/monthly), provider cooldowns, and recent session costs. Call before dispatching batches of model work to pick cheap models and pace quota; high windows (>~80%) or active cooldowns mean provider aborts are likely.",
    parameters: Type.Object({}),
    execute: async () => {
      const lines: string[] = [];
      const accounts = await loadAccounts();
      if (accounts.length === 0) {
        lines.push("No OpenCode Go accounts configured.");
      } else {
        const results = await Promise.allSettled(accounts.map((a) => fetchAccountUsage(a)));
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const label = accounts[i].label;
          if (r.status === "rejected") {
            lines.push(`${label}: fetch failed`);
            continue;
          }
          const u = r.value;
          const windows = [
            u.rolling && `rolling ${u.rolling.usagePercent.toFixed(0)}%`,
            u.weekly && `weekly ${u.weekly.usagePercent.toFixed(0)}%`,
            u.monthly && `monthly ${u.monthly.usagePercent.toFixed(0)}%`,
          ]
            .filter(Boolean)
            .join(", ");
          lines.push(`${label}: ${u.error ? `error (${u.error})` : windows || "no data"}`);
        }
      }
      const cooldowns = loadPersistedCooldowns();
      const nowMs = Date.now();
      const active = Object.entries(cooldowns).filter(([, until]) => until > nowMs);
      lines.push(
        active.length === 0
          ? "Cooldowns: none active"
          : `Cooldowns: ${active.map(([k, until]) => `${k} until ${new Date(until).toISOString()}`).join(", ")}`,
      );
      try {
        const { existsSync, readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const { homedir } = await import("node:os");
        const historyPath = join(homedir(), ".pi", "agent", "observability", "history.jsonl");
        if (existsSync(historyPath)) {
          const recent = readFileSync(historyPath, "utf8")
            .split("\n")
            .filter(Boolean)
            .slice(-5)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter((e): e is Record<string, unknown> => !!e && typeof e === "object");
          if (recent.length > 0) {
            lines.push("Recent sessions (model, cost):");
            for (const s of recent) {
              lines.push(`- ${s.model ?? "?"}: $${Number(s.cost ?? 0).toFixed(2)} (${s.inputTokens ?? 0}↑/${s.outputTokens ?? 0}↓)`);
            }
          }
        }
      } catch {
        // history is best-effort
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  });

  let accounts: OpenCodeGoAccount[] = [];
  let usages: AccountUsage[] = [];
  let activeAccount: OpenCodeGoAccount | null = null;
  let lastFetch = 0;
  let forceRefresh = false;
  // Auto-continue state (ROADMAP item 6): armed when a quota/auth error
  // caused an in-turn account switch; consumed at agent_settled so the retry
  // fires only after pi's own retry/compaction/queued continuations settled.
  let pendingSwitchRetry = false;
  let currentTurnIndex = 0;

  // Overnight resume (ROADMAP): when ALL accounts are on cooldown, wait for
  // the earliest reset and queue one safe retry. Fires at most once per
  // exhaustion cycle (reset() happens when a refresh sees an account back).
  const resume = createResumeScheduler({
    graceMs: RESUME_GRACE_MS,
    now: deps.now,
    setTimer: deps.setTimer,
    clearTimer: deps.clearTimer,
    onFire: async () => {
      log(`resume: earliest reset reached, queueing retry prompt`);
      await pi.sendUserMessage(RESUME_PROMPT, { deliverAs: "followUp" });
    },
  });

  function maybeArmResume(): void {
    const now = Date.now();
    const g = globalThis as Record<string, unknown>;
    const allExhausted = g.__opencode_go_all_exhausted === true;
    if (!allExhausted) {
      resume.reset();
      return;
    }
    const earliest = computeEarliestReset(usages, now);
    if (earliest === null) {
      resume.reset();
      return;
    }
    resume.arm(earliest);
    log(
      `resume armed until=${new Date(earliest).toISOString()} state=${resume.state}`,
    );
  }

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
    // Accounts recovered (or cooldowns cleared) → ready for the next cycle.
    if (
      (globalThis as Record<string, unknown>).__opencode_go_all_exhausted !==
      true
    ) {
      if (resume.state !== "idle") {
        log(`resume reset by refresh (state=${resume.state})`);
      }
      resume.reset();
    }
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
    // Only quota failures arm the overnight resume; auth failures (e.g. a bad
    // key) would just fail again after the cooldown, so don't wake the user.
    if (reason === "quota") maybeArmResume();
  }

  function clearCooldowns(): void {
    const now = Date.now();
    for (const usage of usages) usage.exhaustedUntil = undefined;
    savePersistedCooldowns({});
    publishCoordinationFlags(usages, now, activeAccount);
    resume.reset();
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

  pi.on("turn_start", async (event, ctx) => {
    currentTurnIndex = event.turnIndex;
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
    pendingSwitchRetry = true;
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
    pendingSwitchRetry = true;
  });

  // Safe auto-continue: fires only when a switch happened this run, an
  // alternate account is available, and the run has fully settled (pi's own
  // auto-retry already ran its budget). Sends a user-level retry prompt via
  // followUp so it queues cleanly; cleared immediately to guarantee at most
  // one auto-continue per error.
  pi.on("agent_settled", async (_event, ctx) => {
    if (!pendingSwitchRetry) return;
    // Consume immediately (synchronously) so a re-entrant agent_settled can
    // never double-fire, and a stale flag can't survive into a later turn.
    pendingSwitchRetry = false;
    if (!AUTO_CONTINUE_ENABLED) return;
    const g = globalThis as Record<string, unknown>;
    if (g.__opencode_go_all_exhausted === true) {
      log(
        `auto-continue skipped turn=${currentTurnIndex}: all accounts exhausted`,
      );
      return;
    }
    if (!ctx.isIdle()) {
      log(
        `auto-continue turn=${currentTurnIndex}: agent not idle, queueing via followUp`,
      );
    } else {
      log(`auto-continue turn=${currentTurnIndex}: queueing retry prompt`);
    }
    await pi.sendUserMessage(AUTO_CONTINUE_PROMPT, { deliverAs: "followUp" });
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
      const g = globalThis as Record<string, unknown>;
      const allExhausted = g.__opencode_go_all_exhausted === true;
      const earliest = computeEarliestReset(usages, now);
      const earliestInfo =
        allExhausted && earliest !== null
          ? ` earliest_reset=${formatReset(
              Math.max(0, Math.floor((earliest - now) / 1000)),
            )}`
          : "";
      const resumeState =
        allExhausted && resume.state !== "idle"
          ? ` resume=${resume.state}`
          : "";
      ctx.ui.notify(
        `OpenCode Go failover: active=${activeAccount?.label ?? "—"} ` +
          `accounts=${accounts.length} alternates=${alternates} ` +
          `all_exhausted=${allExhausted ? "yes" : "no"}${earliestInfo}${resumeState}`,
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

  // Debug harness for the auto-continue spike: arms the switch-retry flag so
  // the next agent_settled runs the real auto-continue path (same code as a
  // genuine quota-error switch). No args = arm, "status" = show flag state.
  pi.registerCommand("opencode-autocontinue-test", {
    description:
      "Debug: arm the auto-continue-after-switch retry (next agent_settled fires it)",
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase();
      if (sub === "status") {
        ctx.ui.notify(
          `auto-continue: enabled=${AUTO_CONTINUE_ENABLED} pending=${pendingSwitchRetry}`, "info",
        );
        return;
      }
      pendingSwitchRetry = true;
      log(`auto-continue armed by debug command (turn=${currentTurnIndex})`);
      ctx.ui.notify(
        "Armed auto-continue — send a normal prompt; when it settles, a retry turn will auto-queue", "info",
      );
    },
  });
}
