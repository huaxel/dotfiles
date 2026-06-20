/**
 * Subscription ROI Tracker — pi extension
 * Tracks subscription value vs API cost in real-time.
 *
 * Commands:
 *   /sub-compare         — show full dashboard (current month)
 *   /sub-compare <date>  — show dashboard since date (e.g. 2026-05-01)
 *   /sub-compare <sub>   — show single subscription detail
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function resolveSubsPath(): string {
  const candidates = [
    join(homedir(), "Projects/sub-roi-tracker/data/subscriptions.json"),
    join(homedir(), "coding/projects/sub-roi-tracker/data/subscriptions.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}
const SUBS_PATH = resolveSubsPath();
const MODELS_PATH = join(homedir(), ".pi/agent/models.json");
const SESSIONS_DIR = join(homedir(), ".pi/agent/sessions");

interface SubConfig {
  name: string;
  cost: number;
  period: string;
  provider: string;
  models: string[];
}

interface Pricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface SubStats {
  name: string;
  cost: number;
  period: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  apiCost: number;
  days: Set<string>;
  models: Set<string>;
  turns: number;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildPricingMap(): Map<string, Pricing> {
  const pricing = new Map<string, Pricing>();
  try {
    const modelsJson = loadJson<any>(MODELS_PATH);
    for (const provider of Object.values(modelsJson.providers || {})) {
      for (const model of (provider as any).models || []) {
        if (model.cost) {
          pricing.set(model.id, {
            input: model.cost.input / 1_000_000,
            output: model.cost.output / 1_000_000,
            cacheRead: model.cost.cacheRead / 1_000_000,
            cacheWrite: model.cost.cacheWrite / 1_000_000,
          });
        }
      }
    }
  } catch (e) {
    console.error("[sub-compare] failed to load pricing:", e);
  }
  return pricing;
}

// Provider aliases: JSONL provider name -> subscriptions.json provider name
const PROVIDER_ALIASES: Record<string, string> = {
  firepass: "fireworks",
  "fireworks-ai": "fireworks",
  "openai-codex": "openai",
};

function normalizeProvider(p: string): string {
  return PROVIDER_ALIASES[p] || p;
}

function buildModelToSubMap(subs: Record<string, SubConfig>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [subId, sub] of Object.entries(subs)) {
    for (const model of sub.models) {
      map.set(`${sub.provider}:${model}`, subId);
      // Also add alias mappings so JSONL provider names match
      const normalized = normalizeProvider(sub.provider);
      if (normalized !== sub.provider) {
        map.set(`${normalized}:${model}`, subId);
      }
    }
  }
  return map;
}

function initStats(subs: Record<string, SubConfig>): Record<string, SubStats> {
  const stats: Record<string, SubStats> = {};
  for (const [subId, sub] of Object.entries(subs)) {
    stats[subId] = {
      name: sub.name,
      cost: sub.cost,
      period: sub.period,
      provider: sub.provider,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      apiCost: 0,
      days: new Set(),
      models: new Set(),
      turns: 0,
    };
  }
  return stats;
}

function processMessage(
  msg: any,
  modelToSub: Map<string, string>,
  pricing: Map<string, Pricing>,
  stats: Record<string, SubStats>,
  date: string
): void {
  if (!msg || msg.role !== "assistant" || !msg.usage) return;
  const model = msg.model;
  const usage = msg.usage;
  if (!model) return;

  const provider = normalizeProvider(msg.provider || "");
  const subKey = provider ? `${provider}:${model}` : model;
  const subId = modelToSub.get(subKey) || modelToSub.get(model);
  if (!subId) return;

  const s = stats[subId];
  if (!s) return;

  s.inputTokens += usage.input || 0;
  s.outputTokens += usage.output || 0;
  s.cacheReadTokens += usage.cacheRead || 0;
  s.cacheWriteTokens += usage.cacheWrite || 0;
  s.days.add(date);
  s.models.add(model);
  s.turns++;

  const price = pricing.get(model);
  if (price) {
    s.apiCost +=
      (usage.input || 0) * price.input +
      (usage.output || 0) * price.output +
      (usage.cacheRead || 0) * price.cacheRead +
      (usage.cacheWrite || 0) * price.cacheWrite;
  }
}

function scanSessionFile(
  filePath: string,
  modelToSub: Map<string, string>,
  pricing: Map<string, Pricing>,
  stats: Record<string, SubStats>,
  since: string
): void {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const sinceDate = new Date(since);

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type !== "message") continue;
        const timestamp = data.timestamp ? new Date(data.timestamp) : null;
        if (timestamp && timestamp < sinceDate) continue;

        const msg = data.message;
        const date = data.timestamp?.slice(0, 10) || new Date().toISOString().slice(0, 10);
        processMessage(msg, modelToSub, pricing, stats, date);
      } catch {
        continue;
      }
    }
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return; // Session file not created yet — expected during init
    }
    console.error("[sub-compare] failed to scan session file:", filePath, e);
  }
}

function scanSession(ctx: ExtensionContext, modelToSub: Map<string, string>, pricing: Map<string, Pricing>, stats: Record<string, SubStats>, since: string): void {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile) {
    scanSessionFile(sessionFile, modelToSub, pricing, stats, since);
  }
}

function scanAllSessions(
  modelToSub: Map<string, string>,
  pricing: Map<string, Pricing>,
  stats: Record<string, SubStats>,
  since: string
): void {
  try {
    const entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = join(SESSIONS_DIR, entry.name);
      const files = readdirSync(dirPath).filter((f: string) => f.endsWith(".jsonl"));
      for (const file of files) {
        const filePath = join(dirPath, file);
        try {
          scanSessionFile(filePath, modelToSub, pricing, stats, since);
        } catch {
          continue;
        }
      }
    }
  } catch (e) {
    console.error("[sub-compare] failed to scan sessions directory:", e);
  }
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

function renderDashboard(stats: Record<string, SubStats>, since: string): string[] {
  const lines: string[] = [];
  lines.push(`\n┌─ Subscription ROI ── Since ${since} ─┐\n`);

  const rows = Object.entries(stats)
    .filter(([_, s]) => s.inputTokens + s.outputTokens > 0)
    .sort((a, b) => b[1].apiCost - a[1].apiCost);

  if (rows.length === 0) {
    lines.push("No usage found for tracked subscriptions.");
    return lines;
  }

  for (const [_, s] of rows) {
    const isFree = s.cost === 0;
    const valueMultiplier = isFree ? Infinity : s.apiCost / s.cost;
    const indicator = isFree ? "💚" : valueMultiplier >= 1.0 ? "🟢" : "🔴";

    lines.push(
      `${indicator} ${s.name}` + (isFree ? " (FREE)" : ` ($${s.cost}/${s.period})`)
    );
    lines.push(
      `   Usage: ${fmtTokens(s.inputTokens)} in │ ${fmtTokens(s.outputTokens)} out │ ` +
      `${fmtTokens(s.cacheReadTokens)} cache │ ${s.turns} turns`
    );
    if (isFree) {
      lines.push(`   API cost: $${s.apiCost.toFixed(2)} │ FREE (saving $${s.apiCost.toFixed(2)})`);
    } else {
      lines.push(
        `   API cost: $${s.apiCost.toFixed(2)} │ Sub: $${s.cost.toFixed(2)} │ ` +
        `Value: ${valueMultiplier.toFixed(1)}x`
      );
    }
    lines.push(`   Days active: ${s.days.size}`);
    lines.push(`   Models: ${Array.from(s.models).join(", ")}`);
    if (s.provider === "fireworks") {
      lines.push(`   ⚡ Fireworks Turbo: check /speed for live decode TPS`);
    }
    lines.push("");
  }

  lines.push("└─ /sub-compare <date> for custom range ─┘\n");
  return lines;
}

export default function (pi: ExtensionAPI) {
  let subs: Record<string, SubConfig> = {};
  let modelToSub: Map<string, string> = new Map();
  let pricing: Map<string, Pricing> = new Map();
  let stats: Record<string, SubStats> = {};
  let sessionStart: string = new Date().toISOString().slice(0, 10);

  function loadConfig() {
    try {
      subs = loadJson<{ subscriptions: Record<string, SubConfig> }>(SUBS_PATH).subscriptions;
      modelToSub = buildModelToSubMap(subs);
      pricing = buildPricingMap();
      stats = initStats(subs);
    } catch (e) {
      console.error("[sub-compare] config error:", e);
    }
  }

  pi.on("session_start", async (event, ctx) => {
    loadConfig();
    sessionStart = new Date().toISOString().slice(0, 10);
    // Scan current session for historical data
    scanSession(ctx, modelToSub, pricing, stats, sessionStart);
  });

  pi.on("message_end", async (event) => {
    const msg = event.message;
    const date = new Date().toISOString().slice(0, 10);
    processMessage(msg, modelToSub, pricing, stats, date);
  });

  pi.registerCommand("sub-compare", {
    description:
      "Subscription ROI dashboard. Usage: /sub-compare [date] or /sub-compare [sub-id]",
    handler: async (args, ctx) => {
      const arg = (args || "").trim();

      // If a date is provided, scan all sessions for that range
      if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
        stats = initStats(subs);
        scanAllSessions(modelToSub, pricing, stats, arg);
        const lines = renderDashboard(stats, arg);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // Show single subscription
      if (arg && subs[arg]) {
        const s = stats[arg];
        if (!s || s.turns === 0) {
          ctx.ui.notify(`No usage for ${subs[arg].name} yet.`, "info");
          return;
        }
        const lines = renderDashboard({ [arg]: s }, sessionStart);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // Show all (current session only, live data)
      const lines = renderDashboard(stats, sessionStart);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
