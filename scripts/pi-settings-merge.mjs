#!/usr/bin/env node
/**
 * Merge machine-local Pi settings into pi/agent/settings.json.
 *
 * Why this exists: `strip-pi-machine-config.mjs` is a git clean filter that
 * deletes every `packages` entry that is not `npm:`, `git:`, or `http(s):`.
 * Local-path sources (a patched checkout, an extension still under
 * development) therefore never reach a commit — which is correct, they are
 * per-machine. The catch is that `git pull` rewrites settings.json from the
 * committed blob and silently drops them, and `git diff` still shows nothing
 * because the same filter masks the difference. The extension just stops
 * loading, with no error anywhere.
 *
 * `pi/agent/settings.local.json` (gitignored) holds those per-machine values.
 * This script re-applies them, and `--check` fails when they have gone missing
 * so the lose-it-on-pull cycle is caught by the gate instead of by a
 * mysteriously absent tool.
 *
 * Usage:
 *   node scripts/pi-settings-merge.mjs           # apply (idempotent)
 *   node scripts/pi-settings-merge.mjs --check   # report drift, exit 1
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = resolve(ROOT, 'pi/agent/settings.json');
const OVERLAY = resolve(ROOT, 'pi/agent/settings.local.json');

/** Keys the clean filter strips: they are machine state, not repository state. */
const MACHINE_KEYS = ['deviceId', 'lastChangelogVersion', 'extensionChangelogVersions'];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
}

function isLocalPackage(entry) {
  return typeof entry === 'string' && !/^(npm:|git:|https?:)/.test(entry);
}

/**
 * Ensure every overlay package is present, without reordering the committed
 * ones. Local sources go after the last committed entry so the file keeps
 * reading the same way it does after a plain deploy.
 */
export function mergeSettings(settings, overlay) {
  const next = structuredClone(settings);
  const added = [];

  if (Array.isArray(overlay.packages)) {
    next.packages = Array.isArray(next.packages) ? next.packages : [];
    for (const entry of overlay.packages) {
      if (!isLocalPackage(entry)) {
        throw new Error(
          `settings.local.json: package '${entry}' is not a local path; ` +
            'shared sources belong in settings.json where they are committed',
        );
      }
      if (!next.packages.includes(entry)) {
        next.packages.push(entry);
        added.push(entry);
      }
    }
  }

  for (const key of MACHINE_KEYS) {
    if (key in overlay) next[key] = overlay[key];
  }

  return { next, added };
}

export function findDrift(settings, overlay) {
  const missing = [];
  if (Array.isArray(overlay.packages)) {
    const have = Array.isArray(settings.packages) ? settings.packages : [];
    for (const entry of overlay.packages) {
      if (!have.includes(entry)) missing.push(`packages: ${entry}`);
    }
  }
  for (const key of MACHINE_KEYS) {
    if (key in overlay && JSON.stringify(settings[key]) !== JSON.stringify(overlay[key])) {
      missing.push(`${key}: ${JSON.stringify(overlay[key])}`);
    }
  }
  return missing;
}

function main(argv) {
  const check = argv.includes('--check');

  if (!existsSync(OVERLAY)) {
    if (check) {
      console.log('  ⚠️  no pi/agent/settings.local.json — nothing machine-local to verify');
      return 0;
    }
    console.log(`  ⚠️  no overlay at ${OVERLAY} — nothing to merge`);
    return 0;
  }

  const settings = readJson(SETTINGS);
  const overlay = readJson(OVERLAY);

  if (check) {
    const drift = findDrift(settings, overlay);
    if (drift.length > 0) {
      console.error(`  ❌ pi/agent/settings.json lost machine-local entries:`);
      for (const line of drift) console.error(`     - ${line}`);
      console.error('  Run: just pi-settings-merge');
      return 1;
    }
    console.log('  ✅ machine-local Pi settings are present');
    return 0;
  }

  const { next, added } = mergeSettings(settings, overlay);
  if (added.length === 0) {
    console.log('  ✅ already merged — no change');
    return 0;
  }
  writeFileSync(SETTINGS, `${JSON.stringify(next, null, 2)}\n`);
  for (const entry of added) console.log(`  + packages: ${entry}`);
  console.log(`  ✅ re-applied ${added.length} machine-local entr${added.length === 1 ? 'y' : 'ies'}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`pi-settings-merge: ${error.message}`);
    process.exit(2);
  }
}
