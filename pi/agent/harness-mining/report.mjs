#!/usr/bin/env node
// Aggregate the records written by extract.mjs into a report.
//
//   node report.mjs [--out DIR] [--top N]
//
// Everything printed here is a hypothesis. The corpus has no counterfactual:
// no session was ever run twice with and without a harness change, so a
// correlation is a candidate to test, never a finding.

import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = { out: path.join(HERE, "out"), top: 40, activeDays: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--out") options.out = path.resolve(value), (i += 1);
    else if (arg === "--top") options.top = Number(value), (i += 1);
    else if (arg === "--active-days") options.activeDays = Number(value), (i += 1);
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: report.mjs [--out DIR] [--top N] [--active-days N]");
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const pct = (numerator, denominator) =>
  denominator > 0 ? `${((100 * numerator) / denominator).toFixed(1)}%` : "–";
const num = (value) => (value ?? 0).toLocaleString("en-US");
const money = (value) => (value === null || value === undefined ? "–" : `$${value.toFixed(2)}`);

function table(rows, headers) {
  if (rows.length === 0) return "_none_\n";
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  const line = (cells) => `| ${cells.map((cell, i) => String(cell).padStart(widths[i])).join(" | ")} |`;
  return `${line(headers)}\n${line(widths.map((width) => "-".repeat(width)))}\n${rows
    .map((row) => line(row))
    .join("\n")}\n`;
}

async function loadRecords(outDir) {
  const recordsDir = path.join(outDir, "records");
  let names;
  try {
    names = (await fsp.readdir(recordsDir)).filter((name) => name.endsWith(".json"));
  } catch {
    throw new Error(`no records in ${recordsDir} — run extract.mjs first`);
  }
  const records = [];
  for (const name of names) {
    try {
      records.push(JSON.parse(await fsp.readFile(path.join(recordsDir, name), "utf8")));
    } catch {
      // A truncated record is skipped rather than failing the whole report.
    }
  }
  let errorTexts = {};
  try {
    errorTexts = JSON.parse(await fsp.readFile(path.join(outDir, "error-text.json"), "utf8"));
  } catch {
    // The reason map is optional; the report still works without it.
  }
  return { records, errorTexts };
}

/**
 * Collapse duplicate session files. A session can exist in both the runtime
 * session directory and a dotfiles-copied one, and the runtime directory itself
 * keeps several files per session, so the same conversation appears under
 * different paths. The session header id is authoritative; the most complete
 * record wins.
 */
function dedupeById(records) {
  const byId = new Map();
  let duplicates = 0;
  for (const record of records) {
    const key = record.id ?? record.file;
    const existing = byId.get(key);
    if (existing === undefined) {
      byId.set(key, record);
      continue;
    }
    duplicates += 1;
    if ((record.totalMessages ?? 0) > (existing.totalMessages ?? 0)) byId.set(key, record);
  }
  return { records: [...byId.values()], duplicates };
}

function aggregate(records, topN, activeDays) {
  const summary = {
    sessions: records.length,
    duplicates: 0,
    machines: new Set(records.map((record) => record.machine)),
    formatVersions: new Map(),
    firstStarted: null,
    lastEnded: null,
    messages: 0,
    toolCalls: 0,
    toolErrors: 0,
    cost: null,
    tokens: 0,
    compactions: 0,
    modelChanges: 0,
    thinkingLevelChanges: 0,
    parseErrors: 0,
  };
  const byTool = new Map();
  const bySignature = new Map();
  const bySectionSet = new Map();
  const byModel = new Map();
  const byThinking = new Map();
  const byCustomType = new Map();
  const byStopReason = new Map();
  const sessionsWithFailure = new Set();

  for (const record of records) {
    summary.formatVersions.set(
      record.formatVersion ?? "unknown",
      (summary.formatVersions.get(record.formatVersion ?? "unknown") ?? 0) + 1,
    );
    if (record.startedAt && (!summary.firstStarted || record.startedAt < summary.firstStarted)) {
      summary.firstStarted = record.startedAt;
    }
    if (record.endedAt && (!summary.lastEnded || record.endedAt > summary.lastEnded)) {
      summary.lastEnded = record.endedAt;
    }
    summary.messages += record.totalMessages ?? 0;
    summary.toolCalls += record.toolCallCount ?? 0;
    summary.toolErrors += record.toolErrorCount ?? 0;
    summary.compactions += record.compactions ?? 0;
    summary.modelChanges += record.modelChanges ?? 0;
    summary.thinkingLevelChanges += record.thinkingLevelChanges ?? 0;
    summary.parseErrors += record.parseErrors ?? 0;
    summary.tokens += record.tokens?.total ?? 0;
    if (typeof record.cost === "number") summary.cost = (summary.cost ?? 0) + record.cost;

    for (const [tool, calls] of Object.entries(record.calls ?? {})) {
      const entry = byTool.get(tool) ?? { tool, calls: 0, errors: 0 };
      entry.calls += calls;
      byTool.set(tool, entry);
    }
    for (const [tool, errors] of Object.entries(record.errors ?? {})) {
      const entry = byTool.get(tool) ?? { tool, calls: 0, errors: 0 };
      entry.errors += errors;
      byTool.set(tool, entry);
    }

    if ((record.failing ?? []).length > 0) sessionsWithFailure.add(record.file);
    for (const failure of record.failing ?? []) {
      const entry = bySignature.get(failure.sig) ?? {
        sig: failure.sig,
        tool: failure.tool,
        occurrences: 0,
        sessions: new Set(),
        reasons: new Map(),
        cwds: new Map(),
        lastSeen: null,
      };
      entry.occurrences += failure.n;
      entry.sessions.add(record.file);
      const when = record.endedAt ?? record.startedAt;
      if (when && (entry.lastSeen === null || when > entry.lastSeen)) entry.lastSeen = when;
      const cwd = (record.cwd ?? "?").replace(/\/$/, "").split("/").pop() || "?";
      entry.cwds.set(cwd, (entry.cwds.get(cwd) ?? 0) + 1);
      for (const [hash, count] of Object.entries(failure.reasons ?? {})) {
        entry.reasons.set(hash, (entry.reasons.get(hash) ?? 0) + count);
      }
      bySignature.set(failure.sig, entry);
    }

    const sectionKey = record.sectionSetHash ?? "unknown";
    const config = bySectionSet.get(sectionKey) ?? {
      key: sectionKey,
      sessions: 0,
      toolCalls: 0,
      toolErrors: 0,
      cost: 0,
      compactions: 0,
      sections: record.sections ?? {},
      tools: (record.toolsDeclared ?? []).length,
    };
    config.sessions += 1;
    config.toolCalls += record.toolCallCount ?? 0;
    config.toolErrors += record.toolErrorCount ?? 0;
    config.cost += record.cost ?? 0;
    config.compactions += record.compactions ?? 0;
    bySectionSet.set(sectionKey, config);

    for (const model of Object.keys(record.models ?? {})) {
      const entry = byModel.get(model) ?? { model, sessions: 0, calls: 0, errors: 0 };
      entry.sessions += 1;
      entry.calls += record.toolCallCount ?? 0;
      entry.errors += record.toolErrorCount ?? 0;
      byModel.set(model, entry);
    }
    for (const level of Object.keys(record.thinkingLevels ?? {})) {
      const entry = byThinking.get(level) ?? { level, sessions: 0, calls: 0, errors: 0 };
      entry.sessions += 1;
      entry.calls += record.toolCallCount ?? 0;
      entry.errors += record.toolErrorCount ?? 0;
      byThinking.set(level, entry);
    }
    for (const [custom, count] of Object.entries(record.customTypes ?? {})) {
      byCustomType.set(custom, (byCustomType.get(custom) ?? 0) + count);
    }
    for (const [reason, count] of Object.entries(record.stopReasons ?? {})) {
      byStopReason.set(reason, (byStopReason.get(reason) ?? 0) + count);
    }
  }

  const allSignatures = [...bySignature.values()].map((entry) => ({
    ...entry,
    sessionCount: entry.sessions.size,
  }));
  const rankedSignatures = allSignatures
    .sort((a, b) => b.sessionCount - a.sessionCount || b.occurrences - a.occurrences)
    .slice(0, topN);

  const rankedTools = [...byTool.values()]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 20);

  // Prompt-surface cost, from what was actually sent rather than estimated.
  const withSchema = records.filter((r) => (r.schemaChars ?? 0) > 0);
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
  const schemaTokens = withSchema.map((r) => r.schemaChars / 4);
  const firstPrompt = withSchema.filter((r) => r.firstPromptTokens).map((r) => r.firstPromptTokens);
  // Weighted rather than median x requests: each session contributes its own schema
  // size against its own measured token total.
  let weightedSchema = 0;
  let weightedRequests = 0;
  let measuredTokens = 0;
  let corpusTokens = 0;
  for (const r of records) {
    corpusTokens += r.tokens?.total ?? 0;
    if ((r.schemaChars ?? 0) > 0) {
      weightedSchema += (r.schemaChars / 4) * (r.counts?.assistant ?? 0);
      weightedRequests += r.counts?.assistant ?? 0;
      measuredTokens += r.tokens?.total ?? 0;
    }
  }
  const surface = {
    sessions: withSchema.length,
    medianSchemaTokens: Math.round(median(schemaTokens)),
    medianTools: Math.round(median(withSchema.map((r) => r.schemaTools ?? 0))),
    tokensPerTool: Math.round(median(schemaTokens) / (median(withSchema.map((r) => r.schemaTools ?? 1)) || 1)),
    medianFirstPrompt: Math.round(median(firstPrompt)),
    firstPromptShare: median(firstPrompt) > 0 ? Math.round((100 * median(schemaTokens)) / median(firstPrompt)) : 0,
    weightedTokens: weightedSchema,
    requests: weightedRequests,
    measuredTokens,
    corpusTokens,
    // Like-for-like: schema x requests over the same sessions' tokens. Dividing by
    // the whole corpus would deflate the share, since only these sessions persisted
    // a schema while every session contributes tokens.
    measuredShare: measuredTokens > 0 ? (100 * weightedSchema) / measuredTokens : 0,
    corpusShare: corpusTokens > 0 ? (100 * weightedSchema) / corpusTokens : 0,
  };

  const perMachine = new Map();
  for (const record of records) {
    const entry = perMachine.get(record.machine) ?? { machine: record.machine, sessions: 0, calls: 0, errors: 0, latest: null };
    entry.sessions += 1;
    entry.calls += record.toolCallCount ?? 0;
    entry.errors += record.toolErrorCount ?? 0;
    const when = record.endedAt ?? record.startedAt;
    if (when && (entry.latest === null || when > entry.latest)) entry.latest = when;
    perMachine.set(record.machine, entry);
  }

  const rankedConfigs = [...bySectionSet.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  // A signature ranked highly on all-time volume may have stopped months ago, so
  // the actionable list is the subset still occurring near the end of the corpus.
  const corpusEnd = records
    .map((record) => record.endedAt ?? record.startedAt)
    .filter(Boolean)
    .sort()
    .pop();
  const activeCutoff = corpusEnd
    ? new Date(Date.parse(corpusEnd) - activeDays * 86_400_000).toISOString()
    : "";
  const activeList = allSignatures
    .filter((entry) => entry.sessionCount >= 3 && (entry.lastSeen ?? "") >= activeCutoff)
    .sort((a, b) => b.sessionCount - a.sessionCount || b.occurrences - a.occurrences)
    .slice(0, 15);

  const pressure = [...records]
    .sort((a, b) => (b.compactions ?? 0) - (a.compactions ?? 0) || b.toolCallCount - a.toolCallCount)
    .slice(0, 10);

  // Wall time per tool. `ask_user` measures human response time, not harness
  // latency, so it is reported separately rather than folded into the total.
  const latency = new Map();
  let measuredMs = 0;
  let measuredResults = 0;
  for (const record of records) {
    for (const [tool, ms] of Object.entries(record.durationByTool ?? {})) {
      const entry = latency.get(tool) ?? { tool, ms: 0, slow: 0 };
      entry.ms += ms;
      entry.slow += record.slowByTool?.[tool] ?? 0;
      latency.set(tool, entry);
      measuredMs += ms;
    }
    measuredResults += Object.keys(record.durationByTool ?? {}).length;
  }
  const latencyRows = [...latency.values()].sort((a, b) => b.ms - a.ms);
  const humanMs = latency.get("ask_user")?.ms ?? 0;

  // Prompt sections are persisted only by recent pi versions, so attribution
  // covers a fraction of the corpus. Report the real coverage rather than
  // implying that configuration has been correlated across all of it.
  const attributed = records.filter((record) => Object.keys(record.sections ?? {}).length > 0);
  const earliestAttributed =
    attributed.map((record) => record.startedAt).filter(Boolean).sort()[0] ?? null;
  const fingerprints = new Set(attributed.map((record) => record.sectionSetHash));
  const attribution =
    attributed.length === records.length
      ? `Every session carries harness attribution (${fingerprints.size} distinct fingerprints).`
      : `**Attribution is partial.** ${num(attributed.length)} of ${num(records.length)} sessions persist a prompt-section fingerprint (earliest ${earliestAttributed ? earliestAttributed.slice(0, 10) : "–"}); earlier sessions predate section persistence and show an empty fingerprint. ${num(fingerprints.size)} distinct fingerprints over those sessions is far too sparse to correlate configuration with outcome — their value is that attribution now accrues on every new session.`;

  return {
    summary,
    rankedSignatures,
    rankedTools,
    rankedConfigs,
    pressure,
    byModel: [...byModel.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 12),
    byThinking: [...byThinking.values()].sort((a, b) => b.sessions - a.sessions),
    byCustomType: [...byCustomType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    byStopReason: [...byStopReason.entries()].sort((a, b) => b[1] - a[1]),
    sessionsWithFailure: sessionsWithFailure.size,
    surface,
    perMachine: [...perMachine.values()].sort((a, b) => b.sessions - a.sessions),
    latencyRows,
    measuredMs,
    humanMs,
    recurring: allSignatures.filter((entry) => entry.sessionCount >= 3).length,
    signatureCount: allSignatures.length,
    activeDays,
    activeSignatures: allSignatures.filter(
      (entry) => entry.sessionCount >= 3 && (entry.lastSeen ?? "") >= activeCutoff,
    ).length,
    activeSignaturesList: activeList,
    recurringErrors: allSignatures
      .filter((entry) => entry.sessionCount >= 3)
      .reduce((total, entry) => total + entry.occurrences, 0),
    attribution,
  };
}

function render(data, errorTexts) {
  const { summary } = data;
  const out = [];
  const date = (value) => (value ? String(value).slice(0, 10) : "–");

  out.push("# Harness mining report");
  out.push("");
  out.push(
    `Generated ${new Date().toISOString()}. Source: pi session JSONL, structure only — no message or tool-output text.`,
  );
  out.push("");

  out.push("## Corpus");
  out.push("");
  out.push(
    "**`latest` is the staleness check.** A machine whose latest session is well before the others is offline or idle, and its rows below are as old as that date rather than current.",
  );
  out.push("");
  out.push(
    table(
      data.perMachine.map((entry) => [
        entry.machine,
        num(entry.sessions),
        num(entry.calls),
        pct(entry.errors, entry.calls),
        (entry.latest ?? "–").slice(0, 10),
      ]),
      ["machine", "sessions", "tool calls", "err rate", "latest"],
    ),
  );
  out.push(
    table(
      [
        ["sessions", num(summary.sessions)],
        ["session files", `${num(summary.sessions + summary.duplicates)} (${num(summary.duplicates)} duplicate files collapsed)`],
        ["machines", [...summary.machines].join(", ") || "–"],
        ["date range", `${date(summary.firstStarted)} → ${date(summary.lastEnded)}`],
        [
          "session format",
          [...summary.formatVersions.entries()].map(([v, n]) => `v${v}: ${num(n)}`).join(", "),
        ],
        ["messages", num(summary.messages)],
        ["tool calls", num(summary.toolCalls)],
        ["tool errors", `${num(summary.toolErrors)} (${pct(summary.toolErrors, summary.toolCalls)})`],
        ["sessions with ≥1 failure", `${num(data.sessionsWithFailure)} (${pct(data.sessionsWithFailure, summary.sessions)})`],
        [
          "recurring signatures (≥3 sessions)",
          `${num(data.recurring)} of ${num(data.signatureCount)} signatures, covering ${pct(data.recurringErrors, summary.toolErrors)} of errors`,
        ],
        ["compactions", num(summary.compactions)],
        ["model / thinking changes", `${num(summary.modelChanges)} / ${num(summary.thinkingLevelChanges)}`],
        ["tokens", num(summary.tokens)],
        ["recorded cost", money(summary.cost)],
        ["unparseable lines", num(summary.parseErrors)],
      ],
      ["metric", "value"],
    ),
  );

  out.push("## Error rate by tool");
  out.push("");
  out.push(
    table(
      data.rankedTools.map((entry) => [
        entry.tool,
        num(entry.calls),
        num(entry.errors),
        pct(entry.errors, entry.calls),
      ]),
      ["tool", "calls", "errors", "rate"],
    ),
  );

  out.push("## Recurring failing invocations");
  out.push("");
  out.push("Ranked by distinct sessions. Same normalized invocation failing in one session twice counts once here.");
  out.push("");
  out.push(
    "**`last seen` is the recency check.** A signature whose last occurrence predates a fix has stopped happening; one whose date keeps advancing has not. This is the falsification test for any change made in response to this report.",
  );
  out.push("");
  out.push(
    "**Read a row by its `distinct` and `top` columns, not by its tool.** A high `top` share means the signature names one behaviour — `grep -n Q P` carries 98% of 1,191 hits under a single reason. A low share means it aggregates: `ctx_execute(code language)` spans 160 reasons at 6%, and even the shell signature `cd P && uv run ruff check P P P …` spans 161 at 1%. For aggregating rows the session count means *how often this operation fails*, not how often one defect recurs.",
  );
  out.push("");
  out.push(
    table(
      data.rankedSignatures.map((entry) => {
        const topReason = [...entry.reasons.entries()].sort((a, b) => b[1] - a[1])[0];
        const reason = topReason ? (errorTexts[topReason[0]] ?? topReason[0]) : "–";
        const topCwd = [...entry.cwds.entries()].sort((a, b) => b[1] - a[1])[0];
        const reasonTotal = [...entry.reasons.values()].reduce((sum, n) => sum + n, 0);
        const topShare = reasonTotal > 0 ? Math.round((100 * (topReason?.[1] ?? 0)) / reasonTotal) : 0;
        return [
          entry.sessionCount,
          entry.occurrences,
          (entry.lastSeen ?? "–").slice(0, 10),
          entry.tool,
          topCwd ? `${topCwd[0]} (${topCwd[1]})` : "–",
          entry.reasons.size,
          `${topShare}%`,
          reason.length > 34 ? `${reason.slice(0, 34)}…` : reason,
          entry.sig.length > 40 ? `${entry.sig.slice(0, 40)}…` : entry.sig,
        ];
      }),
      ["sessions", "hits", "last seen", "tool", "top cwd", "distinct", "top", "most common reason", "signature"],
    ),
  );

  out.push("### Still occurring");
  out.push("");
  out.push(
    `Recurring signatures whose last occurrence falls in the final ${data.activeDays} days of the corpus. This is the actionable subset: a signature ranked highly on all-time volume may have stopped months ago. ${num(data.activeSignatures)} of ${num(data.recurring)} recurring signatures are still live.`,
  );
  out.push("");
  out.push(
    table(
      data.activeSignaturesList.map((entry) => [
        entry.sessionCount,
        entry.occurrences,
        (entry.lastSeen ?? "–").slice(0, 10),
        entry.tool,
        entry.sig.length > 60 ? `${entry.sig.slice(0, 60)}…` : entry.sig,
      ]),
      ["sessions", "hits", "last seen", "tool", "signature"],
    ),
  );

  out.push("## Harness configuration coverage");
  out.push("");
  out.push(
    "Sessions grouped by prompt-section fingerprint (name + hash of every section in effect). Configs appearing once are omitted.",
  );
  out.push("");
  out.push(
    table(
      data.rankedConfigs.map((entry) => [
        entry.sessions,
        Object.keys(entry.sections).length,
        entry.tools,
        num(entry.toolCalls),
        pct(entry.toolErrors, entry.toolCalls),
        num(entry.compactions),
        entry.key.slice(0, 12),
      ]),
      ["sessions", "sections", "tools", "calls", "err rate", "compact", "fingerprint"],
    ),
  );
  out.push("");
  out.push(data.attribution);
  out.push("");

  out.push("## Prompt surface");
  out.push("");
  out.push(
    `Every tool declaration is re-sent with every request. Measured from the ${num(data.surface.sessions)} sessions that persist one:`,
  );
  out.push("");
  out.push(
    table(
      [
        ["median declared schema", `${num(data.surface.medianSchemaTokens)} tokens`],
        ["median tools declared", num(data.surface.medianTools)],
        ["median cost per tool", `${num(data.surface.tokensPerTool)} tokens`],
        ["median first request", `${num(data.surface.medianFirstPrompt)} tokens`],
        ["schema share of first request", `${data.surface.firstPromptShare}%`],
        [
          "weighted over the sessions that persist one",
          `${(data.surface.weightedTokens / 1e9).toFixed(2)}B of ${(data.surface.measuredTokens / 1e9).toFixed(1)}B (${data.surface.measuredShare.toFixed(1)}%)`,
        ],
        [
          "against the whole corpus (lower bound)",
          `${(data.surface.weightedTokens / 1e9).toFixed(2)}B of ${(data.surface.corpusTokens / 1e9).toFixed(1)}B (${data.surface.corpusShare.toFixed(1)}%)`,
        ],
      ],
      ["metric", "value"],
    ),
  );
  out.push(
    `Each session contributes its own schema size times its own request count. The like-for-like row divides by the tokens of the same ${num(data.surface.sessions)} sessions; the corpus row divides by all tokens and is a lower bound, since only those sessions persisted a schema. ${num(data.surface.requests)} measured requests in total.`,
  );
  out.push("");

  out.push("## Where wall time goes");
  out.push("");
  out.push(
    "Measured wall time per tool, summed over every session that records a duration. `ask_user` is a human wait — it measures how long a person took to answer, not harness latency — and is excluded from the machine total.",
  );
  out.push("");
  out.push(
    table(
      data.latencyRows.slice(0, 14).map((entry) => [
        entry.tool,
        num(Math.round(entry.ms / 3_600_000)),
        pct(entry.ms, data.measuredMs),
        (entry.ms / 3_600_000).toFixed(1),
        num(entry.slow),
      ]),
      ["tool", "hours", "% of measured", "hours (1dp)", "calls ≥60s"],
    ),
  );
  out.push(
    `Machine time totals ${(data.measuredMs / 3_600_000).toFixed(0)} hours; human waits in \`ask_user\` add ${(data.humanMs / 3_600_000).toFixed(0)} hours on top and dominate the raw figure.`,
  );
  out.push("");

  out.push("## Context pressure");
  out.push("");
  out.push(
    table(
      data.pressure.map((record) => [
        record.compactions ?? 0,
        num(record.toolCallCount),
        num(record.totalMessages),
        `${record.durationMinutes ?? "–"}m`,
        (record.cwd ?? "–").replace(/^\/home\/[^/]+\//, "~/"),
      ]),
      ["compactions", "calls", "messages", "span", "cwd"],
    ),
  );

  out.push("## Models and thinking levels");
  out.push("");
  out.push(
    table(
      data.byModel.map((entry) => [entry.model, entry.sessions, num(entry.calls), pct(entry.errors, entry.calls)]),
      ["model", "sessions", "calls", "err rate"],
    ),
  );
  out.push("");
  out.push(
    table(
      data.byThinking.map((entry) => [entry.level, entry.sessions, pct(entry.errors, entry.calls)]),
      ["thinking level", "sessions", "err rate"],
    ),
  );

  if (data.byCustomType.length > 0) {
    out.push("## Extension-written session entries");
    out.push("");
    out.push(table(data.byCustomType.map(([kind, count]) => [kind, num(count)]), ["customType", "entries"]));
  }

  if (data.byStopReason.length > 0) {
    out.push("## Assistant stop reasons");
    out.push("");
    out.push(table(data.byStopReason.map(([reason, count]) => [reason, num(count)]), ["stopReason", "messages"]));
  }

  out.push("## How to read this");
  out.push("");
  out.push("- **These are hypotheses, not findings.** No session was run with and without a harness change, so nothing here has a counterfactual. A recurring signature says *where to look*, not *what to change*.");
  out.push("- **Configuration rows are confounded.** A section fingerprint with a low error rate may simply be a fingerprint you used on easy work. Recurrence across many distinct sessions raises confidence; it does not establish cause.");
  out.push("- **The gate before any edit:** the signature must recur in several distinct sessions, and the change it suggests must target a harness artifact (AGENTS.md section, a SKILL.md, an extension, a prompt template). Singletons are the failure mode that turns a harness store into a work log.");
  out.push("- **Only a paired arm produces evidence.** Upstream `packages/evals` already implements two-arm runs and lift; reuse it for the few candidates worth measuring.");
  out.push("");

  return out.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadRecords(options.out);
  const deduped = dedupeById(loaded.records);
  const data = aggregate(deduped.records, options.top, options.activeDays);
  data.summary.duplicates = deduped.duplicates;
  const report = render(data, loaded.errorTexts);
  const target = path.join(options.out, "report.md");
  await fsp.writeFile(target, report);

  const { summary } = data;
  const digest = [
    `${num(summary.sessions)} sessions (${summary.machines.size} machine(s)) → ${num(summary.toolCalls)} tool calls, ${summary.toolErrors} errors (${pct(summary.toolErrors, summary.toolCalls)})`,
    `${data.recurring} signatures recur in ≥3 distinct sessions`,
    "",
    "top recurring failures:",
    ...data.rankedSignatures.slice(0, 8).map((entry, index) => {
      const sig = entry.sig.length > 78 ? `${entry.sig.slice(0, 78)}…` : entry.sig;
      return `${String(index + 1).padStart(2)}. [${entry.sessionCount} sessions, ${entry.occurrences} hits] ${sig}`;
    }),
  ].join("\n");
  console.log(digest);
  console.log(`\nfull report: ${target}`);
}

await main();
