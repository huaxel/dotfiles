#!/usr/bin/env node
// Emit a single-file ESM build of the extractor on stdout.
//
// The build runs on another machine through stdin, so that machine needs
// neither this directory nor any file written to its disk:
//
//   node bundle.mjs > /tmp/harness-mining.mjs
//   ssh other-machine 'node --input-type=module - --sessions ~/dotfiles/pi/agent/sessions' \
//     < /tmp/harness-mining.mjs | node ingest.mjs
//
// Defaults resolve from import.meta.url, which is unavailable when reading from
// stdin, so every remote run must pass --sessions explicitly.

import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const library = (await fsp.readFile(path.join(HERE, "lib.mjs"), "utf8")).replace(/^export /gm, "");
const extractor = (await fsp.readFile(path.join(HERE, "extract.mjs"), "utf8"))
  .replace(/^#!.*\n/, "")
  .replace(/^import \{[^}]*\} from "\.\/lib\.mjs";\n/gm, "");

process.stdout.write(`${library}\n${extractor}`);
