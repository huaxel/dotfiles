#!/usr/bin/env node
/**
 * Contract for the machine-local Pi settings merge: what a pull can destroy,
 * and what the merge must not touch.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDrift, mergeSettings } from '../pi-settings-merge.mjs';

const BASE = {
  packages: ['npm:pi-memory', 'git:github.com/x/y@abc', '../../../src/pi-graphs'],
  extensionChangelogVersions: { 'npm:pi-memory': '1.0.0' },
  theme: 'dark',
};

test('re-adds a local package that a pull removed', () => {
  const afterPull = { ...BASE, packages: ['npm:pi-memory', 'git:github.com/x/y@abc'] };
  const { next, added } = mergeSettings(afterPull, { packages: ['../../../src/pi-graphs'] });
  assert.deepEqual(added, ['../../../src/pi-graphs']);
  assert.ok(next.packages.includes('../../../src/pi-graphs'));
});

test('is idempotent', () => {
  const once = mergeSettings(BASE, { packages: ['../../../src/pi-graphs'] });
  assert.deepEqual(once.added, []);
  const twice = mergeSettings(once.next, { packages: ['../../../src/pi-graphs'] });
  assert.deepEqual(twice.added, []);
  assert.deepEqual(twice.next.packages, BASE.packages);
});

test('restores machine fields the clean filter deletes', () => {
  const stripped = { ...BASE };
  delete stripped.extensionChangelogVersions;
  const { next } = mergeSettings(stripped, {
    extensionChangelogVersions: { 'npm:pi-memory': '1.0.0' },
    deviceId: 'abc',
  });
  assert.deepEqual(next.extensionChangelogVersions, { 'npm:pi-memory': '1.0.0' });
  assert.equal(next.deviceId, 'abc');
});

test('refuses to smuggle a shared source into the overlay', () => {
  assert.throws(
    () => mergeSettings(BASE, { packages: ['npm:pi-vibe-acp'] }),
    /not a local path/,
  );
  assert.throws(
    () => mergeSettings(BASE, { packages: ['git:github.com/x/y'] }),
    /not a local path/,
  );
});

test('leaves unrelated settings alone', () => {
  const { next } = mergeSettings(BASE, { packages: ['../../../src/pi-vibe-acp'] });
  assert.equal(next.theme, 'dark');
  assert.deepEqual(next.packages.slice(0, 3), BASE.packages);
});

test('drift reports exactly the missing entries', () => {
  const afterPull = { ...BASE, packages: ['npm:pi-memory'], extensionChangelogVersions: {} };
  const drift = findDrift(afterPull, {
    packages: ['../../../src/pi-graphs'],
    extensionChangelogVersions: { 'npm:pi-memory': '1.0.0' },
  });
  assert.equal(drift.length, 2);
  assert.match(drift[0], /pi-graphs/);
  assert.match(drift[1], /extensionChangelogVersions/);
});

test('no drift when the file already matches', () => {
  assert.deepEqual(findDrift(BASE, { packages: ['../../../src/pi-graphs'] }), []);
});
