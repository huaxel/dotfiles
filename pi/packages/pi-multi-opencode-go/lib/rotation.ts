import {
  AUTH_ERROR_COOLDOWN_MS,
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  MIN_COOLDOWN_MS,
} from "./constants.ts";
import type {
  AccountUsage,
  ExhaustReason,
  OpenCodeGoAccount,
  OpenCodeGoWindow,
} from "./types.ts";

function effectivePercent(window: OpenCodeGoWindow | null): number {
  if (!window) return Infinity;
  return Number.isFinite(window.usagePercent) ? window.usagePercent : Infinity;
}

export function cooldownMsForUsage(usage: AccountUsage): number {
  const windows = [usage.rolling, usage.weekly, usage.monthly].filter(
    Boolean,
  ) as OpenCodeGoWindow[];
  let resetSec = 0;
  for (const w of windows) {
    if (w.usagePercent >= 100 && w.resetInSec > 0) {
      resetSec = Math.max(resetSec, w.resetInSec);
    }
  }
  if (resetSec <= 0 && usage.weekly && usage.weekly.usagePercent >= 90) {
    resetSec = usage.weekly.resetInSec;
  }
  if (resetSec > 0) {
    return Math.min(
      Math.max(resetSec * 1000, MIN_COOLDOWN_MS),
      MAX_COOLDOWN_MS,
    );
  }
  return DEFAULT_COOLDOWN_MS;
}

export function isAccountExhausted(usage: AccountUsage, now: number): boolean {
  return Boolean(usage.exhaustedUntil && usage.exhaustedUntil > now);
}

export function publishCoordinationFlags(
  usages: AccountUsage[],
  now: number,
  active: OpenCodeGoAccount | null,
): void {
  const alternates = usages.filter(
    (u) => !isAccountExhausted(u, now) && u.account.label !== active?.label,
  );
  (globalThis as Record<string, unknown>).__opencode_go_has_fallback =
    alternates.length > 0;
  (globalThis as Record<string, unknown>).__opencode_go_all_exhausted =
    usages.length > 0 && usages.every((u) => isAccountExhausted(u, now));
}

function scoreAccount(usage: AccountUsage, now: number): number[] {
  if (isAccountExhausted(usage, now)) {
    return [Infinity, Infinity, Infinity, Infinity];
  }
  const r = effectivePercent(usage.rolling);
  const w = effectivePercent(usage.weekly);
  const m = effectivePercent(usage.monthly);
  return [r >= 100 ? 1 : 0, w >= 100 ? 1 : 0, m >= 100 ? 1 : 0, r, w, m];
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return (a[i] ?? Infinity) - (b[i] ?? Infinity);
  }
  return 0;
}

function compareUsages(u1: AccountUsage, u2: AccountUsage, now: number): number {
  const byScore = compareScores(scoreAccount(u1, now), scoreAccount(u2, now));
  if (byScore !== 0) return byScore;
  const w1 = u1.weekly?.resetInSec ?? Infinity;
  const w2 = u2.weekly?.resetInSec ?? Infinity;
  return w1 - w2;
}

export function pickBestAccount(
  usages: AccountUsage[],
  accounts: OpenCodeGoAccount[],
  now: number,
): OpenCodeGoAccount | null {
  if (usages.length > 0) {
    const sorted = [...usages].sort((u1, u2) => compareUsages(u1, u2, now));
    const available = sorted.find((u) => !isAccountExhausted(u, now));
    if (available) return available.account;
    const best = sorted[0];
    if (best) return best.account;
  }
  return accounts[0] ?? null;
}

export function computeExhaustedUntil(
  usage: AccountUsage | undefined,
  reason: ExhaustReason,
  now: number,
): number {
  const cooldownMs =
    reason === "auth"
      ? AUTH_ERROR_COOLDOWN_MS
      : usage
        ? cooldownMsForUsage(usage)
        : DEFAULT_COOLDOWN_MS;
  return now + cooldownMs;
}

export function applyExhaustedToUsage(
  usage: AccountUsage,
  exhaustedUntil: number,
): void {
  usage.exhaustedUntil = exhaustedUntil;
  if (!usage.rolling) usage.rolling = { usagePercent: 100, resetInSec: 0 };
  else usage.rolling.usagePercent = Math.max(usage.rolling.usagePercent, 100);
}
