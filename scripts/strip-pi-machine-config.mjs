#!/usr/bin/env node

/**
 * Git clean filter for pi_settings.
 *
 * Pi rewrites runtime/local preferences such as changelog acknowledgement and
 * selected default model. Keep those useful locally, but store stable values in
 * git so `git status` does not get noisy after Pi starts or a model changes.
 */
import { readFileSync } from 'node:fs';

const input = readFileSync(0, 'utf8');

let settings;
try {
  settings = JSON.parse(input);
} catch (error) {
  console.error(`strip-pi-machine-config: invalid JSON: ${error.message}`);
  process.exit(1);
}

settings.lastChangelogVersion = '0.0.0';

if (settings.defaults && typeof settings.defaults === 'object' && !Array.isArray(settings.defaults)) {
  settings.defaults.model = null;
}

settings.defaultProvider = null;
settings.defaultModel = null;
settings.defaultThinkingLevel = 'high';

process.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
