// Shared helpers for the harness-mining extractor and report.
// Everything here is deterministic and free of model calls.

import { createHash } from "node:crypto";

/** Bump when the record schema or a normalization rule changes. */
export const EXTRACTOR_VERSION = 7;

/** Short stable hash for correlating harness configuration across machines. */
export function sha(value, length = 16) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

// Ordered so that named secrets are replaced before the generic blob rule.
const SECRET_PATTERNS = [
  [
    /\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL)[A-Za-z0-9_]*)\s*=\s*\S+/gi,
    "$1=<redacted>",
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer <redacted>"],
  [/\b(?:sk|pk|ghp|gho|ghs|ghu|glpat|xox[abprs]|AKIA|AIza|ya29)[-_A-Za-z0-9]{12,}/g, "<redacted>"],
];

// Long unbroken runs of base64/hex characters. Separators (- _) and dots are
// excluded so that readable filenames and UUIDs survive, and a run followed by
// a file extension is kept as a path.
const BLOB_PATTERN = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{48,}={0,2}(?![A-Za-z0-9+/])/g;

/** Strip credential-shaped substrings. Applied before any text is kept. */
export function redact(value) {
  let out = String(value ?? "");
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out.replace(BLOB_PATTERN, (match, offset, whole) =>
    whole[offset + match.length] === "." ? match : "<redacted-blob>",
  );
}

/**
 * Reduce a command to its shape: quoted strings, paths, hashes, and numbers
 * become placeholders so that the same failing invocation recurring across
 * sessions collapses to one signature.
 */
export function normalizeCommand(raw) {
  let text = redact(raw);
  text = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, " "); // ANSI escapes
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/'[^']*'/g, "Q").replace(/"[^"]*"/g, "Q");
  text = text.replace(/(^|[\s=(])((?:\.{1,2}\/|\/|~\/)[^\s"')]*)/g, "$1P");
  // Relative paths carry no leading marker, so without this every file in a lint
  // or grep command becomes its own signature and one recurring behaviour looks
  // like hundreds of one-offs.
  text = text.replace(/(^|[\s=|(])((?!https?:)[^\s"'=|(]*\/[^\s"')]*)/g, "$1P");
  // Bare filenames: no separator at all, but an extension gives them away.
  text = text.replace(/(^|[\s=|(])([A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,6})(?=$|[\s"')|])/g, "$1F");
  text = text.replace(/\b[0-9a-f]{7,}\b/g, "H");
  text = text.replace(/\b\d{2,}\b/g, "N");
  const tokens = text.split(" ").filter(Boolean);
  return tokens.length > 10 ? `${tokens.slice(0, 10).join(" ")} …` : tokens.join(" ");
}

function normalizeValue(value) {
  const text = redact(value).replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

// Tool-call fields that describe intent rather than the operation itself.
const META_KEYS = new Set(["reasoning", "summary", "explanation", "description"]);

// Preference order for the anchor value that makes a failure recur.
const PATH_KEYS = ["path", "file", "file_path", "filePath", "filename", "target", "notebook_path", "url"];
const VALUE_KEYS = ["pattern", "query", "name", "selector", "text"];

/**
 * Build the recurrence key for one tool call. Commands are shape-normalized;
 * other tools are anchored on their path or query argument so that the same
 * failing target collapses to one signature across sessions.
 */
export function signatureFor(toolName, args) {
  const object = args && typeof args === "object" ? args : {};
  if (toolName === "bash" && typeof object.command === "string") {
    return normalizeCommand(object.command);
  }
  for (const key of [...PATH_KEYS, ...VALUE_KEYS]) {
    if (typeof object[key] === "string" && object[key].trim() !== "") {
      return `${toolName}(${key}=${normalizeValue(object[key])})`;
    }
  }
  const keys = Object.keys(object)
    .filter((key) => !META_KEYS.has(key))
    .sort();
  return `${toolName}(${keys.join(" ")})`;
}

// Lines that carry no diagnostic value: bare JSON punctuation and closers.
const NOISE_LINE = /^[{}[\]",;\s]*$/;

/**
 * Failure reason, redacted and capped. The deciding fact sits at different ends
 * for different error shapes: a validation failure names the offending property
 * on line two, a Python traceback puts the exception type just before a trailing
 * `Command exited with code N`, and a long log needs both head and tail. So the
 * first two and last two informative lines are kept, deduplicated and capped.
 * Local output only.
 */
export function normalizeErrorText(value) {
  const lines = redact(value)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && !NOISE_LINE.test(line));
  if (lines.length === 0) return "";
  const picked = [...new Set([...lines.slice(0, 2), ...lines.slice(-2)])];
  const text = picked.join(" · ");
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

/** Flatten a session's relative path into one safe record filename. */
export function recordName(relativePath) {
  const flat = String(relativePath).replace(/[\\/]/g, "__").replace(/\.jsonl$/, "");
  // Session filenames are timestamps and UUIDs; only their own alphabet is kept,
  // so no text redaction runs here (it would collapse every long name to one).
  const safe = flat.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe.length > 180 ? `${sha(flat, 12)}_${safe.slice(-120)}.json` : `${safe}.json`;
}
