// Tests for identical-key dedup (OPENCODE_GO_DEDUP_KEYS) and the env/auth.json
// merge in loadAccounts.
import assert from "node:assert/strict";
import { test } from "node:test";

import { dedupeAccounts, loadAccounts } from "../lib/accounts.ts";
import type { OpenCodeGoAccount } from "../lib/types.ts";

function account(label: string, key: string): OpenCodeGoAccount {
  return { key, workspaceId: `ws-${label}`, authCookie: `c-${label}`, label };
}

test("dedupeAccounts keeps the first occurrence of each key", () => {
  const input = [
    account("sub-1", "key-A"),
    account("sub-2", "key-B"),
    account("sub-3", "key-A"), // duplicate of sub-1
    account("sub-4", "key-B"), // duplicate of sub-2
  ];
  const { accounts, dropped } = dedupeAccounts(input, true);
  assert.deepEqual(accounts.map((a) => a.label), ["sub-1", "sub-2"]);
  assert.deepEqual(dropped, ["sub-3", "sub-4"]);
});

test("dedupeAccounts is a no-op when disabled", () => {
  const input = [account("sub-1", "key-A"), account("sub-2", "key-A")];
  const { accounts, dropped } = dedupeAccounts(input, false);
  assert.equal(accounts.length, 2);
  assert.deepEqual(dropped, []);
});

test("dedupeAccounts passes through single or empty account lists", () => {
  const single = [account("sub-1", "key-A")];
  assert.deepEqual(dedupeAccounts(single, true).dropped, []);
  assert.deepEqual(dedupeAccounts([], true).accounts, []);
});

test("dedupeAccounts distinguishes accounts with unique keys", () => {
  const input = [account("sub-1", "key-A"), account("sub-2", "key-B")];
  const { accounts, dropped } = dedupeAccounts(input, true);
  assert.equal(accounts.length, 2);
  assert.deepEqual(dropped, []);
});

// loadAccounts merges env + auth.json: auth.json entries win on key collision
// (a bare env key that auth.json references via $VAR must not shadow the named
// account), while unique env keys still load so env-only setups keep working.
async function withEnv(authAccounts: unknown[], envVars: Record<string, string>, fn: () => Promise<void>) {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "opencode-merge-"));
  const saved: Record<string, string | undefined> = {};
  const touched = ["PI_CODING_AGENT_DIR", "OPENCODE_GO_DEDUP_KEYS", ...Object.keys(envVars)];
  for (const k of touched) saved[k] = process.env[k];
  // Isolate from any real shell OPENCODE_* vars (e.g. OPENCODE_API_KEY_2)
  const cleared: string[] = [];
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("OPENCODE_API_KEY_") || k.startsWith("OPENCODE_GO_")) {
      if (k !== "OPENCODE_GO_DEDUP_KEYS") {
        cleared.push(k);
        delete process.env[k];
      }
    }
  }
  process.env.PI_CODING_AGENT_DIR = dir;
  delete process.env.OPENCODE_GO_DEDUP_KEYS;
  for (const [k, v] of Object.entries(envVars)) process.env[k] = v;
  await writeFile(
    join(dir, "auth.json"),
    JSON.stringify({ "opencode-go-failover": { accounts: authAccounts } }),
    "utf-8",
  );
  try {
    await fn();
  } finally {
    for (const k of cleared) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("loadAccounts: auth.json wins on key collision with env", async () => {
  await withEnv(
    [
      { label: "sub-1", key: "env-A", workspaceId: "ws-1" },
      { label: "sub-2", key: "env-B", workspaceId: "ws-2" },
    ],
    { OPENCODE_API_KEY_1: "env-A", OPENCODE_API_KEY_2: "env-C" },
    async () => {
      const accounts = await loadAccounts();
      assert.deepEqual(accounts.map((a) => a.label), ["sub-1", "sub-2", "account-2"]);
      assert.equal(accounts.filter((a) => a.key === "env-A").length, 1, "collision resolved to auth.json");
    },
  );
});

test("loadAccounts: env-only setup still loads", async () => {
  await withEnv(
    [],
    { OPENCODE_API_KEY_1: "env-A" },
    async () => {
      const accounts = await loadAccounts();
      assert.deepEqual(accounts.map((a) => a.label), ["account-1"]);
    },
  );
});

test("loadAccounts: auth.json-only setup still loads", async () => {
  await withEnv(
    [{ label: "sub-1", key: "key-A", workspaceId: "ws-1" }],
    {},
    async () => {
      const accounts = await loadAccounts();
      assert.deepEqual(accounts.map((a) => a.label), ["sub-1"]);
    },
  );
});
