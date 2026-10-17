#!/usr/bin/env node
// Ingest extractor NDJSON from stdin into out/ for another machine.
//
//   ssh other-machine 'node --input-type=module - --sessions ... --machine laptop' \
//     < /tmp/harness-mining.mjs | node ingest.mjs
//
// Records are written under out/records/ with the machine name as a filename
// prefix, so records from different machines cannot overwrite each other. The
// reason map is merged into out/error-text.json. index.json is deliberately not
// touched: it tracks this machine's own sessions only.

import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { recordName } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = outIndex === -1 ? path.join(HERE, "out") : path.resolve(args[outIndex + 1]);

const recordsDir = path.join(outDir, "records");
await fsp.mkdir(recordsDir, { recursive: true });

const safeMachine = (name) => String(name ?? "remote").replace(/[^A-Za-z0-9._-]/g, "_");

let written = 0;
let records = 0;
const reasons = new Map();

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (line.trim() === "") continue;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    continue;
  }
  if (parsed.kind === "errorTexts") {
    for (const [hash, text] of Object.entries(parsed.map ?? {})) reasons.set(hash, text);
    continue;
  }
  records += 1;
  const name = `${safeMachine(parsed.machine)}__${recordName(parsed.file)}`;
  await fsp.writeFile(path.join(recordsDir, name), `${JSON.stringify(parsed)}\n`);
  written += 1;
}

if (reasons.size > 0) {
  const textPath = path.join(outDir, "error-text.json");
  let known = {};
  try {
    known = JSON.parse(await fsp.readFile(textPath, "utf8"));
  } catch {
    // First ingest writes the map fresh.
  }
  for (const [hash, text] of reasons) known[hash] = text;
  await fsp.writeFile(textPath, `${JSON.stringify(known, null, 1)}\n`);
}

console.error(`ingested ${written} of ${records} records into ${recordsDir}`);
