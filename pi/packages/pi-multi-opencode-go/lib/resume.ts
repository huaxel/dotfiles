// Overnight-resume scheduler (ROADMAP: "Wait for earliest reset when all
// accounts are on cooldown").
//
// When every account is on cooldown, a failed request would otherwise stay
// dead until the user notices quota came back. This module arms a timer for
// the earliest reset across all accounts and fires exactly one safe retry
// prompt (a user-level nudge, like auto-continue) once that reset passes.
//
// Safety: fires at most once per exhaustion cycle — after firing, `arm()`
// is a no-op until `reset()` is called (which happens as soon as a refresh
// sees at least one account available again). This prevents retry loops.
import type { AccountUsage } from "./types.ts";

/** Earliest future `exhaustedUntil` across accounts, or null if none. */
export function computeEarliestReset(
  usages: AccountUsage[],
  now: number,
): number | null {
  let earliest: number | null = null;
  for (const usage of usages) {
    const until = usage.exhaustedUntil;
    if (until === undefined || until <= now) continue;
    if (earliest === null || until < earliest) earliest = until;
  }
  return earliest;
}

export type ResumeState = "idle" | "armed" | "fired";

export interface ResumeSchedulerOptions {
  /** Clock for computing delays (default: Date.now). Injected for tests. */
  now?: () => number;
  /** Timer creation (default: setTimeout). Injected for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Timer cancellation (default: clearTimeout). Injected for tests. */
  clearTimer?: (handle: unknown) => void;
  /** Extra delay beyond the reset instant before firing (default: 0). */
  graceMs?: number;
  /** Called once when the armed timer fires. */
  onFire: () => void | Promise<void>;
}

export interface ResumeScheduler {
  readonly state: ResumeState;
  /** Schedule the retry for the earliest reset. No-op when armed or fired. */
  arm(earliestResetAt: number): void;
  /** Cancel any pending timer and return to idle (new cycle may re-arm). */
  reset(): void;
  /** Milliseconds until the armed timer would fire, or null. */
  remainingMs(): number | null;
}

export function createResumeScheduler(
  options: ResumeSchedulerOptions,
): ResumeScheduler {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer =
    options.clearTimer ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  const graceMs = options.graceMs ?? 0;

  let state: ResumeState = "idle";
  let handle: unknown = null;
  let target = 0;

  function cancelHandle(): void {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
  }

  return {
    get state() {
      return state;
    },
    arm(earliestResetAt: number) {
      if (state !== "idle") return;
      const delay = Math.max(0, earliestResetAt - now() + graceMs);
      state = "armed";
      target = now() + delay;
      handle = setTimer(() => {
        handle = null;
        if (state !== "armed") return;
        state = "fired";
        void options.onFire();
      }, delay);
    },
    reset() {
      cancelHandle();
      state = "idle";
    },
    remainingMs() {
      if (state !== "armed") return null;
      return Math.max(0, target - now());
    },
  };
}
