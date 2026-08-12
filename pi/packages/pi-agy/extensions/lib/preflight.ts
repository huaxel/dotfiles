import { checkAgyConnectivity, checkAgyHealth } from "./cli.js";

const TTL_MS = 5 * 60 * 1000;
let cachedAt = 0;

/** Run agy health/connectivity checks, cached for a few minutes per process. */
export async function runPreflight(cwd: string, signal?: AbortSignal): Promise<void> {
  if (cachedAt && Date.now() - cachedAt < TTL_MS) return;
  await Promise.all([checkAgyHealth(cwd, signal), checkAgyConnectivity(cwd, signal)]);
  cachedAt = Date.now();
}

/** Test helper — reset the in-process cache. */
export function resetPreflightCache(): void {
  cachedAt = 0;
}
