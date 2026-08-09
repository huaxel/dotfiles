#!/usr/bin/env node
// Regenerates ~/dotfiles/pi/agent/pi-data-masking/masking.config.json (global
// masking rules for the pi-data-masking extension).
//
// WHY THIS EXISTS: the config embeds REAL secret values (env API keys, the
// GitHub CLI oauth token). It is gitignored (dotfiles/.gitignore:
// `pi/agent/pi-data-masking/`). Re-run this script after rotating any key,
// adding a new API key env var, or changing a hostname.
//
// SECURITY: the script reads values from the environment and local files and
// writes them into the config WITHOUT printing them. It only echoes rule ids
// and value lengths. Never log the real values anywhere.
//
// Usage: node bin/gen-masking-global.mjs   (run from the dotfiles repo root)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const OUT = path.join(here, "..", "pi", "agent", "pi-data-masking", "masking.config.json");

// ─── Sources of literal secrets (curated; values never printed) ────────────
const envKeys = [
  "AA_API_KEY", "ALPHAVANTAGE_API_KEY", "ALPHA_VANTAGE_KEY", "ANTIGRAVITY_BRIDGE_KEY",
  "API_SPORTS_KEY", "BRAVE_API_KEY", "CEREBRAS_API_KEY", "CLAUDE_BRIDGE_KEY",
  "CLOUDFLARE_API_KEY", "CONTEXT7_API_KEY", "CONTEXT7_KEY", "CURSOR_API_KEY",
  "EXA_API_KEY", "FIRECRAWL_API_KEY", "FIREWORKS_API_KEY", "GITHUB_PERSONAL_ACCESS_TOKEN",
  "JULES_API_KEY", "NOUS_API_KEY", "NOVITA_API_KEY", "OLLAMA_API_KEY", "OPENCODE_KEY",
  "OPENROUTER_API_KEY", "RAPID_API_KEY", "STARSHIP_SESSION_KEY", "UMANS_API_KEY",
];

const rules = [];
const report = [];

for (const k of envKeys) {
  const v = process.env[k];
  if (v && v.trim().length >= 6) {
    rules.push({
      id: "env_" + k.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      description: `Value of ${k} environment variable`,
      real: v.trim(),
      placeholder: "auto",
    });
    report.push(`  env rule ${k} (len ${v.trim().length})`);
  }
}

// GitHub CLI oauth token (~/.config/gh/hosts.yml)
try {
  const gh = fs.readFileSync(path.join(home, ".config", "gh", "hosts.yml"), "utf8");
  const m = gh.match(/oauth_token:\s*(.+)/);
  if (m && m[1].trim().length >= 10) {
    rules.push({ id: "gh_oauth_token", description: "GitHub CLI oauth token (~/.config/gh/hosts.yml)", real: m[1].trim(), placeholder: "auto" });
    report.push(`  gh oauth token (len ${m[1].trim().length})`);
  }
} catch {}

// npm registry token — historically in <repo-root>/.npmrc (gitignored); not
// currently found in any reachable file. The npm_token / keyword_value_pairs
// regex rules below still cover that format if it ever appears in context.
// If you re-add it, add the read here:
//   const npmrc = fs.readFileSync(path.join(home, "dotfiles", ".npmrc"), "utf8");
//   const m = npmrc.match(/[:_]?authToken[=:]\s*"?([A-Za-z0-9_\-]+)"?/);

// Internal hostnames — manual placeholders so the LLM sees semantic stand-ins
rules.push(
  { id: "host_acerpepe_fqdn", description: "Internal Tailscale FQDN of acerpepe server", real: "acerpepe.bonobo-fort.ts.net", placeholder: "prod-node-1.corp.internal" },
  { id: "host_liedelpi_fqdn", description: "Internal Tailscale FQDN of liedelpi server", real: "liedelpi.bonobo-fort.ts.net", placeholder: "prod-node-2.corp.internal" },
  { id: "host_acerpepe_short", description: "Short hostname of acerpepe server", real: "acerpepe", placeholder: "prod-node-1" },
  { id: "host_liedelpi_short", description: "Short hostname of liedelpi server", real: "liedelpi", placeholder: "prod-node-2" },
);

// ─── Regex rules (adapted from masking.config.example.json) ─────────────────
const regexRules = [
  {
    id: "db_conn_credentials",
    type: "regex",
    description: "Username:password in DB/MQ connection strings (incl. mongodb+srv://).",
    pattern: "(?:postgresql|mysql|mariadb|redis|mongodb(?:\\+srv)?|amqp|amqps):\\/\\/([^\\s]+)@",
  },
  {
    id: "url_userinfo_credentials",
    type: "regex",
    description: "Credentials embedded in any http(s) URL (user:password@host).",
    pattern: "\\bhttps?://[^\\s/:]+:[^\\s/@]+@[^\\s/]+\\b",
  },
  {
    id: "generic_bearer_token",
    type: "regex",
    description: "Bearer token value only; 'Authorization: Bearer ' prefix is kept",
    pattern: "Authorization:\\s*Bearer\\s+([A-Za-z0-9._-]+)",
    flags: "i",
  },
  {
    id: "keyword_value_pairs",
    type: "regex",
    description: "Value portion of key=value / key: value assignments for sensitive keywords. NOTE (upstream pattern, kept verbatim): the bare 'key'/'token' alternatives can match compound field names like sort_key: or foo_token: — intended tradeoff, it also catches my_token: style. Watch the stats panel in atom.",
    pattern: "(?<![A-Za-z])(?:access_token|auth_token|private_key|api_key|apikey|access_key|account_id|accountid|client_id|credential|password|passwd|secret|token|key)\\s*[:=]\\s*\"?([A-Za-z0-9_./@+\\-]+)\"?",
    flags: "i",
  },
  {
    id: "github_pat",
    type: "regex",
    description: "GitHub personal access tokens: ghp_ (classic) and github_pat_ (fine-grained).",
    pattern: "\\bghp_[A-Za-z0-9]{36}\\b|\\bgithub_pat_[A-Za-z0-9_]{22,}\\b",
  },
  {
    id: "npm_token",
    type: "regex",
    description: "npm access tokens (npm_).",
    pattern: "\\bnpm_[A-Za-z0-9]{36}\\b",
  },
  {
    id: "huggingface_token",
    type: "regex",
    description: "Hugging Face access tokens (hf_).",
    pattern: "\\bhf_[A-Za-z0-9]{34,}\\b",
  },
  {
    id: "aws_access_key_id",
    type: "regex",
    description: "AWS access key IDs (AKIA...); matching secret is usually nearby as a secret-access-key pair.",
    pattern: "\\bAKIA[0-9A-Z]{16}\\b",
  },
  {
    id: "jwt_token",
    type: "regex",
    description: "JSON Web Tokens (eyJ...header.payload.signature).",
    pattern: "\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b",
  },
  {
    id: "pem_private_key_block",
    type: "regex",
    description: "PEM private key blocks: only the base64 body is replaced; BEGIN/END lines stay.",
    pattern: "-----BEGIN [A-Z ]*PRIVATE KEY-----([\\s\\S]*?)-----END [A-Z ]*PRIVATE KEY-----",
  },
  {
    id: "private_ip_address",
    type: "regex",
    description: "RFC 1918 private IPv4 addresses only (10/8, 172.16/12, 192.168/16).",
    pattern: "\\b(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3})\\b",
  },
];

rules.push(...regexRules);

const config = {
  enabled: true,
  rules,
  options: { caseSensitive: true, showStatusBar: true },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(config, null, 2) + "\n");

console.log(`Wrote ${OUT}`);
console.log(`${rules.length} rules total:`);
for (const r of report) console.log(r);
console.log(`  + ${regexRules.length} regex rules`);
