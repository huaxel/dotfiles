// Tests for optional identical-key dedup (OPENCODE_GO_DEDUP_KEYS).
import assert from "node:assert/strict";
import { test } from "node:test";

import { dedupeAccounts } from "../lib/accounts.ts";
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
