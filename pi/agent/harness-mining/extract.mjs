#!/usr/bin/env node
// Extract one small record per pi session from JSONL transcripts.
//
// Only derived structure leaves this file: counts, hashes, durations, and
// redacted signatures. No prompt text, tool output, or message content is
// written to the output directory.
//
//   node extract.mjs --sessions ~/dotfiles/pi/agent/sessions
//   node extract.mjs --sessions /other/machine/sessions --machine laptop
//
// Re-running skips unchanged files via out/index.json.

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { EXTRACTOR_VERSION, normalizeErrorText, recordName, sha, signatureFor } from "./lib.mjs";

const HERE = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // Running from stdin (see bundle.mjs) has no module URL.
    return process.cwd();
  }
})();
const DEFAULT_SESSIONS = path.join(HERE, "..", "sessions");

function parseArgs(argv) {
  const options = {
    sessions: [],
    out: path.join(HERE, "out"),
    machine: os.hostname(),
    limit: 0,
    force: false,
    quiet: false,
    errorText: true,
    stdout: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--sessions") options.sessions.push(path.resolve(value)), (i += 1);
    else if (arg === "--out") options.out = path.resolve(value), (i += 1);
    else if (arg === "--machine") options.machine = value, (i += 1);
    else if (arg === "--limit") options.limit = Number(value), (i += 1);
    else if (arg === "--force") options.force = true;
    else if (arg === "--no-error-text") options.errorText = false;
    else if (arg === "--stdout") options.stdout = true;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`usage: extract.mjs [--sessions DIR]... [--out DIR] [--machine NAME]
                  [--limit N] [--force] [--quiet] [--no-error-text] [--stdout]

  --stdout  emit records as NDJSON on stdout and write nothing, for running on
            another machine over stdin. Requires an explicit --sessions.`);
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.sessions.length === 0) options.sessions.push(DEFAULT_SESSIONS);
  return options;
}

async function walkJsonl(root) {
  const found = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
    }
  }
  found.sort();
  return found;
}

function counter() {
  return {};
}

function bump(object, key) {
  object[key] = (object[key] ?? 0) + 1;
}

/** Text of a failed tool result, reduced to a redacted reason string. */
function errorReason(message) {
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text = blocks
    .filter((block) => block?.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
  return normalizeErrorText(text.slice(0, 2000) || "(no message)");
}

/** Parse one session file into its record. Fields absent in older sessions stay null. */
async function extractSession(file, relativePath, machine, errorTexts) {
  const record = {
    v: EXTRACTOR_VERSION,
    machine,
    file: relativePath,
    formatVersion: null,
    id: null,
    cwd: null,
    parentSession: null,
    startedAt: null,
    endedAt: null,
    durationMinutes: null,
    counts: counter(),
    toolsDeclared: [],
    toolSetHash: null,
    calls: counter(),
    errors: counter(),
    toolCallCount: 0,
    toolErrorCount: 0,
    toolCallMs: 0,
    slowCalls: 0,
    failing: [],
    compactions: 0,
    modelChanges: 0,
    thinkingLevelChanges: 0,
    models: counter(),
    thinkingLevels: counter(),
    sections: {},
    sectionSetHash: null,
    customTypes: counter(),
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
    cost: null,
    stopReasons: counter(),
    firstUserHash: null,
    firstUserLength: null,
    parseErrors: 0,
  };

  const declaredTools = new Set();
  const pendingCalls = new Map();
  const failing = new Map();
  let costSeen = false;

  const lines = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      record.parseErrors += 1;
      continue;
    }

    const type = entry.type;
    if (type === "session") {
      record.formatVersion = entry.version ?? null;
      record.id = entry.id ?? null;
      record.cwd = entry.cwd ?? null;
      record.parentSession = entry.parentSession ?? null;
      record.startedAt = entry.timestamp ?? null;
      continue;
    }
    if (entry.timestamp) record.endedAt = entry.timestamp;

    switch (type) {
      case "model_change": {
        record.modelChanges += 1;
        bump(record.models, `${entry.provider ?? "?"}/${entry.modelId ?? "?"}`);
        break;
      }
      case "thinking_level_change": {
        record.thinkingLevelChanges += 1;
        bump(record.thinkingLevels, entry.thinkingLevel ?? "?");
        break;
      }
      case "compaction": {
        record.compactions += 1;
        break;
      }
      case "custom":
      case "custom_message": {
        bump(record.customTypes, entry.customType ?? entry.kind ?? "unknown");
        break;
      }
      default:
        break;
    }

    if (type !== "message") continue;
    const message = entry.message;
    if (!message || typeof message !== "object") continue;
    const role = message.role;
    bump(record.counts, role ?? "unknown");

    if (role === "system") {
      for (const [name, value] of Object.entries(message.sections ?? {})) {
        if (value === null) delete record.sections[name];
        else record.sections[name] = sha(value);
      }
      for (const tool of message.toolsAdded ?? []) if (tool?.name) declaredTools.add(tool.name);
      for (const tool of message.toolsRemoved ?? []) if (tool?.name) declaredTools.delete(tool.name);
      continue;
    }

    if (role === "user") {
      if (record.firstUserHash === null) {
        const blocks = Array.isArray(message.content) ? message.content : [];
        const text = blocks
          .filter((block) => block?.type === "text")
          .map((block) => block.text ?? "")
          .join("\n")
          .trim();
        if (text.length > 0) {
          record.firstUserHash = sha(text);
          record.firstUserLength = text.length;
        }
      }
      continue;
    }

    if (role === "assistant") {
      const usage = message.usage;
      if (usage && typeof usage === "object") {
        record.tokens.input += usage.input ?? 0;
        record.tokens.output += usage.output ?? 0;
        record.tokens.cacheRead += usage.cacheRead ?? 0;
        record.tokens.cacheWrite += usage.cacheWrite ?? 0;
        record.tokens.reasoning += usage.reasoning ?? 0;
        record.tokens.total +=
          usage.totalTokens ??
          (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
        if (usage.cost && typeof usage.cost === "object") {
          costSeen = true;
          record.cost = (record.cost ?? 0) + (usage.cost.total ?? 0);
        }
      }
      if (message.stopReason) bump(record.stopReasons, message.stopReason);
      const blocks = Array.isArray(message.content) ? message.content : [];
      for (const block of blocks) {
        if (block?.type !== "toolCall") continue;
        record.toolCallCount += 1;
        bump(record.calls, block.name ?? "?");
        pendingCalls.set(block.id, { name: block.name ?? "?", args: block.arguments });
      }
      continue;
    }

    if (role === "toolResult") {
      const name = message.toolName ?? pendingCalls.get(message.toolCallId)?.name ?? "?";
      const duration = typeof message.durationMs === "number" ? message.durationMs : 0;
      record.toolCallMs += duration;
      if (duration >= 60_000) record.slowCalls += 1;
      if (message.isError === true) {
        record.toolErrorCount += 1;
        bump(record.errors, name);
        const call = pendingCalls.get(message.toolCallId);
        const key = signatureFor(name, call?.args ?? {});
        const reason = errorReason(message);
        const reasonHash = sha(reason, 12);
        errorTexts.set(reasonHash, reason);
        const existing = failing.get(key) ?? { sig: key, tool: name, n: 0, reasons: {} };
        existing.n += 1;
        existing.reasons[reasonHash] = (existing.reasons[reasonHash] ?? 0) + 1;
        failing.set(key, existing);
      }
      pendingCalls.delete(message.toolCallId);
      continue;
    }
  }

  record.toolsDeclared = [...declaredTools].sort();
  record.totalMessages = Object.values(record.counts).reduce((total, count) => total + count, 0);
  record.toolSetHash = sha(record.toolsDeclared.join(","));
  record.sectionSetHash = sha(
    Object.entries(record.sections)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, hash]) => `${name}:${hash}`)
      .join("|"),
  );
  record.failing = [...failing.values()].sort((a, b) => b.n - a.n || a.sig.localeCompare(b.sig));
  if (!costSeen) record.cost = null;
  if (record.startedAt && record.endedAt) {
    const span = (Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 60_000;
    record.durationMinutes = Number.isFinite(span) && span >= 0 ? Math.round(span) : null;
  }
  return record;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const recordsDir = path.join(options.out, "records");
  await fsp.mkdir(recordsDir, { recursive: true });

  const indexPath = path.join(options.out, "index.json");
  let index = { version: EXTRACTOR_VERSION, files: {} };
  try {
    const loaded = JSON.parse(await fsp.readFile(indexPath, "utf8"));
    if (loaded?.version === EXTRACTOR_VERSION) index = loaded;
  } catch {
    // A missing or outdated index just means a full pass.
  }

  const files = [];
  for (const root of options.sessions) {
    for (const file of await walkJsonl(root)) files.push({ file, root });
  }
  files.sort((a, b) => a.file.localeCompare(b.file));
  const limited = options.limit > 0 ? files.slice(-options.limit) : files;
  const multiRoot = options.sessions.length > 1;
  // Distinct roots can share a basename (~/dotfiles/pi/agent/sessions vs
  // ~/.pi/agent/sessions), so the whole path becomes the prefix.
  const rootPrefix = (root) =>
    root
      .replace(os.homedir(), "~")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  const errorTexts = new Map();
  const startedAt = Date.now();

  for (const { file, root } of limited) {
    const relative = path.relative(root, file) || path.basename(file);
    const relativePath = multiRoot ? path.join(rootPrefix(root), relative) : relative;
    const stat = await fsp.stat(file);
    const prior = index.files[relativePath];
    const name = recordName(relativePath);
    const target = path.join(recordsDir, name);
    if (
      !options.stdout &&
      !options.force &&
      prior &&
      prior.mtimeMs === stat.mtimeMs &&
      prior.size === stat.size &&
      fs.existsSync(target)
    ) {
      skipped += 1;
      continue;
    }
    try {
      const record = await extractSession(file, relativePath, options.machine, errorTexts);
      if (options.stdout) {
        process.stdout.write(`${JSON.stringify(record)}\n`);
      } else {
        await fsp.writeFile(target, `${JSON.stringify(record)}\n`);
        index.files[relativePath] = { mtimeMs: stat.mtimeMs, size: stat.size, record: name };
      }
      extracted += 1;
    } catch (error) {
      failed += 1;
      if (!options.quiet) console.error(`failed: ${relativePath}: ${error.message}`);
    }
    if (!options.quiet && extracted % 250 === 0 && extracted > 0) {
      process.stderr.write(`  ${extracted} extracted, ${skipped} unchanged\r`);
    }
  }

  if (options.stdout) {
    // The reason map travels with the stream so the local ingest can resolve it.
    if (options.errorText && errorTexts.size > 0) {
      process.stdout.write(
        `${JSON.stringify({ kind: "errorTexts", map: Object.fromEntries(errorTexts) })}\n`,
      );
    }
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.error(
      `extracted ${extracted}, failed ${failed} of ${limited.length} sessions in ${seconds}s`,
    );
    return;
  }

  await fsp.writeFile(indexPath, `${JSON.stringify({ ...index, updatedAt: new Date().toISOString() })}\n`);

  if (options.errorText && errorTexts.size > 0) {
    const textPath = path.join(options.out, "error-text.json");
    let known = {};
    try {
      known = JSON.parse(await fsp.readFile(textPath, "utf8"));
    } catch {
      // First pass writes the map fresh.
    }
    for (const [hash, text] of errorTexts) known[hash] = text;
    const ordered = Object.fromEntries(Object.keys(known).sort().map((key) => [key, known[key]]));
    await fsp.writeFile(textPath, `${JSON.stringify(ordered, null, 1)}\n`);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `extracted ${extracted}, unchanged ${skipped}, failed ${failed} of ${limited.length} sessions in ${seconds}s`,
  );
  console.log(`records: ${recordsDir}`);
}

await main();
