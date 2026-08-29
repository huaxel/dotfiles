import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

interface ModelEntry {
	provider: string;
	model: string;
	path: string;
	prompt: string;
}

type SlotThinkingLevel = "off" | "max";

type Slot = {
	description: string;
	thinkingLevel: SlotThinkingLevel;
	models: ModelEntry[];
};

const SLOTS: Record<string, Slot> = {
	fast: {
		description: "quick fixes — flash → free → luna → cursor",
		thinkingLevel: "off",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-flash", path: "go", prompt: "FAST — quick fix. Minimal changes, skip deep analysis." },
			{ provider: "opencode", model: "deepseek-v4-flash-free", path: "free", prompt: "FAST (free) — quick fix. Minimal changes, skip deep analysis." },
			{ provider: "openai-codex", model: "gpt-5.6-luna", path: "codex", prompt: "FAST (luna) — quick fix when Go quota is tight." },
			{ provider: "cursor", model: "composer-2.5", path: "cursor", prompt: "FAST (cursor) — quick fix. Minimal changes." },
		],
	},
	work: {
		description: "implement — flash → free → luna → cursor",
		thinkingLevel: "off",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-flash", path: "go", prompt: "WORK (flash) — focused implementation. Run tests." },
			{ provider: "opencode", model: "deepseek-v4-flash-free", path: "free", prompt: "WORK (free) — focused implementation. Run tests." },
			{ provider: "openai-codex", model: "gpt-5.6-luna", path: "codex", prompt: "WORK (luna) — complex. Think through edge cases." },
			{ provider: "cursor", model: "composer-2.5", path: "cursor", prompt: "WORK (cursor) — focused implementation. Run tests." },
		],
	},
	think: {
		description: "analyze — pro → luna → terra → sol",
		thinkingLevel: "max",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-pro", path: "go", prompt: "THINK (pro) — read fully, explore. Do NOT edit." },
			{ provider: "openai-codex", model: "gpt-5.6-luna", path: "codex", prompt: "THINK (luna) — read fully, trace architecture. Do NOT edit." },
			{ provider: "openai-codex", model: "gpt-5.6-terra", path: "codex", prompt: "THINK (terra) — deep analysis. Do NOT edit." },
			{ provider: "openai-codex", model: "gpt-5.6-sol", path: "codex", prompt: "THINK (sol) — max reasoning. Do NOT edit." },
		],
	},
	review: {
		description: "review — flash → glm → pro → luna → commandcode",
		thinkingLevel: "off",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-flash", path: "go", prompt: "REVIEW (flash) — quick pass. Obvious issues." },
			{ provider: "opencode-go", model: "glm-5.2", path: "go", prompt: "REVIEW (glm-5.2) — thorough. Cite lines, suggest fixes." },
			{ provider: "opencode-go", model: "deepseek-v4-pro", path: "go", prompt: "REVIEW (pro) — thorough. Cite lines, suggest fixes." },
			{ provider: "openai-codex", model: "gpt-5.6-luna", path: "codex", prompt: "REVIEW (luna) — security, correctness, style. Cite lines." },
			{ provider: "commandcode", model: "deepseek/deepseek-v4-pro", path: "go", prompt: "REVIEW (commandcode) — security, architecture, style." },
		],
	},
};

// Path keys in the quota file. The agentq quota.json uses these top-level keys
// under `paths`. The slots `path` field is a short alias mapped to quota-file
// keys. `free` has no quota row (OpenCode free tier). `go` is opencode-go
// (quota often under "openrouter" when present).
const QUOTA_PATH_MAP: Record<string, string | null> = {
	go: "openrouter",
	free: null,
	cursor: "cursor",
	codex: "codex",
};

const QUOTA_FILE =
	process.env.PI_QUOTA_FILE ?? `${homedir()}/projects/agentq/data/quota.json`;

// Cache quota reads so a /slot table render + keystroke cycling don't both hit
// the filesystem. Quota.json is rewritten every ~few minutes by agentq, so a
// short TTL is fine.
const QUOTA_CACHE_TTL_MS = 15_000;

interface WorstWindow {
	pct: number;
	label: string;
	resetsAt: string | null;
}

interface QuotaState {
	data: Record<string, WorstWindow> | null;
	readAt: number;
}

function worstWindow(wins: any[] | undefined): WorstWindow | null {
	if (!wins?.length) return null;
	let worst = wins[0];
	for (const w of wins) {
		if ((w.usedPercent ?? 0) > (worst.usedPercent ?? 0)) worst = w;
	}
	return {
		pct: worst.usedPercent ?? 0,
		label: worst.label || "?",
		resetsAt: worst.resetsAt ?? null,
	};
}

let quotaCache: QuotaState = { data: null, readAt: 0 };

function readQuota(force = false): Record<string, WorstWindow> | null {
	const now = Date.now();
	if (!force && quotaCache.data && now - quotaCache.readAt < QUOTA_CACHE_TTL_MS) {
		return quotaCache.data;
	}
	try {
		if (!existsSync(QUOTA_FILE)) {
			quotaCache = { data: null, readAt: now };
			return null;
		}
		const raw = JSON.parse(readFileSync(QUOTA_FILE, "utf8"));
		const out: Record<string, WorstWindow> = {};
		for (const [p, d] of Object.entries(raw.paths || {}) as any) {
			const w = worstWindow(d.windows);
			if (w) out[p] = w;
		}
		quotaCache = { data: out, readAt: now };
		return out;
	} catch {
		quotaCache = { data: null, readAt: now };
		return null;
	}
}

function quotaTag(path: string, quota: Record<string, WorstWindow> | null): string {
	const mapped = QUOTA_PATH_MAP[path];
	if (mapped === null) return ""; // local — no quota concept
	if (!quota?.[mapped]) return " ?";
	const q = quota[mapped];
	if (q.resetsAt && Date.parse(q.resetsAt) <= Date.now()) return " ↻";
	if (q.pct >= 95) return ` !${q.label}`;
	if (q.pct >= 85) return ` ${q.pct.toFixed(0)}% ${q.label}`;
	if (q.pct > 0) return ` ${q.pct.toFixed(0)}%`;
	return "";
}

// Models temporarily marked exhausted this session (auto-skip). Keyed by
// `provider/model`. Cleared when their quota window resets, or on /slot reset.
const exhausted = new Map<string, number>();

function entryKey(e: ModelEntry): string {
	return `${e.provider}/${e.model}`;
}

function isExhausted(entry: ModelEntry, quota: Record<string, WorstWindow> | null): boolean {
	const ts = exhausted.get(entryKey(entry));
	if (!ts) return false;
	// Auto-clear if the quota window has reset since we marked it.
	const mapped = QUOTA_PATH_MAP[entry.path];
	const q = mapped ? quota?.[mapped] : null;
	if (q?.resetsAt && Date.parse(q.resetsAt) <= Date.now()) {
		exhausted.delete(entryKey(entry));
		return false;
	}
	return true;
}

const QUOTA_ERROR_RE =
	/quota|insufficient|rate limit|too many requests|429|exceeded|limit/i;

/** OpenCode Go failover extension sets this when another Go sub is still usable. */
function opencodeGoHasAlternate(): boolean {
	return (globalThis as any).__opencode_go_has_fallback === true;
}

/** Whether a model is registered/enabled in pi's model registry. */
function isRegistered(entry: ModelEntry, ctx: any): boolean {
	try {
		return !!ctx?.modelRegistry?.find(entry.provider, entry.model);
	} catch {
		return false;
	}
}

export default function (pi: ExtensionAPI) {
	let slot: string | undefined;
	let modelIdx = 0;
	// True when the current model was selected by the slot itself (via /slot or
	// Ctrl+Shift+U). Cleared when the user picks a model through /model or
	// Ctrl+P, so we stop injecting a now-stale slot prompt.
	let slotOwnsModel = false;

	// Failover dedupe: after_provider_response can fire for the same failing
	// request on retry, and message_end may also fire shortly after. We only
	// fail over once per ~5s per provider to avoid a cascade of switches.
	let lastFailoverKey: string | undefined;
	let lastFailoverAt = 0;
	const FAILOVER_DEDUPE_MS = 5_000;

	const CUSTOM_TYPE = "slots-state";

	function currentEntry(): ModelEntry | undefined {
		if (!slot) return undefined;
		return SLOTS[slot]?.models[modelIdx];
	}

	async function switchModel(
		ctx: any,
		slotName: string,
		index: number,
	): Promise<boolean> {
		const entry = SLOTS[slotName]?.models[index];
		if (!entry) return false;
		const m = ctx.modelRegistry.find(entry.provider, entry.model);
		if (!m || !(await pi.setModel(m))) return false;
		pi.setThinkingLevel(SLOTS[slotName].thinkingLevel);
		slot = slotName;
		modelIdx = index;
		slotOwnsModel = true;
		persist();
		updateFooter(ctx);
		return true;
	}

	/** Persist current slot state so it survives /reload and /resume. */
	function persist(): void {
		try {
			pi.appendEntry(CUSTOM_TYPE, { slot, modelIdx });
		} catch {
			// appendEntry can throw if the session isn't writable (ephemeral).
		}
	}

	/** Restore slot state from the most recent persisted entry. */
	function restore(ctx: any): void {
		try {
			const entries = ctx.sessionManager.getEntries();
			for (let i = entries.length - 1; i >= 0; i--) {
				const e: any = entries[i];
				if (e?.type === "custom" && e.customType === CUSTOM_TYPE && e.data) {
					const s = typeof e.data.slot === "string" ? e.data.slot : undefined;
					const idx = Number.isFinite(e.data.modelIdx) ? Number(e.data.modelIdx) : 0;
					if (s && SLOTS[s]) {
						slot = s;
						modelIdx = Math.min(Math.max(idx, 0), SLOTS[s].models.length - 1);
						// Don't claim ownership until the model actually matches —
						// the active model may have changed externally.
						const entry = currentEntry();
						const active = ctx.model;
						slotOwnsModel =
							!!entry &&
							!!active &&
							active.provider === entry.provider &&
							active.id === entry.model;
					}
					return;
				}
			}
		} catch {
			// sessionManager not available in this context.
		}
	}

	const STATUS_KEY = "slot";

	/** Footer indicator: shows active slot + model, or clears it. */
	function updateFooter(ctx: any): void {
		try {
			if (!slot || !slotOwnsModel) {
				ctx?.ui?.setStatus(STATUS_KEY, undefined);
				return;
			}
			const entry = currentEntry();
			if (!entry) {
				ctx?.ui?.setStatus(STATUS_KEY, undefined);
				return;
			}
			const tag = quotaTag(entry.path, readQuota());
			const think = SLOTS[slot].thinkingLevel === "max" ? " ⚡" : "";
			ctx?.ui?.setStatus(STATUS_KEY, `${slot}:${entry.model}${think}${tag}`);
		} catch {
			// ctx/ui may be stale across reloads.
		}
	}

	function showTable(ctx: any, quota: Record<string, WorstWindow> | null) {
		const lines: string[] = [];
		for (const [s, entry] of Object.entries(SLOTS)) {
			const active = s === slot ? "→" : " ";
			const models = entry.models.map((m, i) => {
				const tag = quotaTag(m.path, quota);
				const dead = isExhausted(m, quota) ? " ✗" : "";
				const off = !isRegistered(m, ctx) ? " ⊘" : "";
				const name = `${m.model}${tag}${dead}${off}`;
				if (s === slot && i === modelIdx) return `[${name}]`;
				return name;
			}).join(" | ");
			lines.push(`${active} ${s.padEnd(6)} ${entry.description}`);
			lines.push(`        ${models}`);
		}
		lines.push("");
		lines.push("legend: [active]  ✗ exhausted  ⊘ disabled  ! label ≥95%");
		ctx.ui.notify(lines.join("\n"), "info");
	}

	/** Detailed per-model status across all slots. */
	function showStatus(ctx: any, quota: Record<string, WorstWindow> | null) {
		const lines: string[] = ["── slots status ──"];
		for (const [s, entry] of Object.entries(SLOTS)) {
			lines.push(`▸ ${s} — ${entry.description}`);
			entry.models.forEach((m, i) => {
				const here = s === slot && i === modelIdx;
				const marker = here ? "→" : " ";
				const enabled = isRegistered(m, ctx);
				const state = !enabled
					? "disabled"
					: isExhausted(m, quota)
						? "exhausted"
						: "ok";
				const pct = quotaPercent(m, quota);
				const pctStr = pct < 0 ? "no quota" : `${pct.toFixed(0)}%`;
				lines.push(
					`  ${marker} ${m.provider}/${m.model}  [${state}]  quota: ${pctStr}`,
				);
			});
		}
		ctx.ui.notify(lines.join("\n"), "info");
	}

	function matchSlot(input: string): string | undefined {
		if (SLOTS[input]) return input;
		const matches = Object.keys(SLOTS).filter((k) => k.startsWith(input));
		return matches.length === 1 ? matches[0] : undefined;
	}

	/** Find the next non-exhausted, enabled model in a slot, starting after idx. */
	function nextAvailable(
		slotName: string,
		fromIdx: number,
		quota: Record<string, WorstWindow> | null,
		ctx: any,
	): { idx: number; entry: ModelEntry } | null {
		const models = SLOTS[slotName].models;
		for (let step = 1; step <= models.length; step++) {
			const i = (fromIdx + step) % models.length;
			const m = models[i];
			if (isExhausted(m, quota)) continue;
			if (!isRegistered(m, ctx)) continue;
			return { idx: i, entry: m };
		}
		return null;
	}

	/** Quota usage percent for an entry, or -1 if it has no quota concept. */
	function quotaPercent(entry: ModelEntry, quota: Record<string, WorstWindow> | null): number {
		const mapped = QUOTA_PATH_MAP[entry.path];
		if (mapped === null || !quota?.[mapped]) return -1;
		const q = quota[mapped];
		if (q.resetsAt && Date.parse(q.resetsAt) <= Date.now()) return 0; // window reset → fresh
		return q.pct;
	}

	/** Pick the enabled, non-exhausted model with the lowest quota usage. */
	function bestAvailable(
		slotName: string,
		quota: Record<string, WorstWindow> | null,
		ctx: any,
	): { idx: number; entry: ModelEntry } | null {
		const models = SLOTS[slotName].models;
		let best: { idx: number; entry: ModelEntry; pct: number } | null = null;
		for (let i = 0; i < models.length; i++) {
			const m = models[i];
			if (isExhausted(m, quota)) continue;
			if (!isRegistered(m, ctx)) continue;
			const pct = quotaPercent(m, quota);
			if (!best || pct < best.pct) best = { idx: i, entry: m, pct };
		}
		return best ? { idx: best.idx, entry: best.entry } : null;
	}

	pi.registerCommand("slot", {
		description:
			"Switch role+model. /slot fast|work|think|review, /slot status for details, /slot reset to clear exhausted. Ctrl+Shift+U cycles models in current slot.",
		getArgumentCompletions: (prefix: string) => {
			const all = [
				...Object.keys(SLOTS).map((n) => ({ value: n, label: n, description: SLOTS[n].description })),
				{ value: "status", label: "status", description: "Show detailed per-model quota and enabled state" },
				{ value: "reset", label: "reset", description: "Clear exhausted-model markers" },
			];
			const filtered = all.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const input = args.trim().toLowerCase();
			const quota = readQuota();

			if (input === "reset") {
				const cleared = exhausted.size;
				exhausted.clear();
				ctx.ui.notify(`Cleared ${cleared} exhausted marker${cleared === 1 ? "" : "s"}`, "info");
				showTable(ctx, readQuota(true));
				return;
			}

			if (input === "status" || input === "s") {
				showStatus(ctx, readQuota(true));
				return;
			}

			if (input) {
				const matched = matchSlot(input);
				if (!matched) {
					ctx.ui.notify(`Unknown slot: ${input}. Try: ${Object.keys(SLOTS).join(", ")}`, "error");
					return;
				}
				// Pick the enabled, non-exhausted model with the lowest quota usage.
				const pick = bestAvailable(matched, quota, ctx) ?? { idx: 0, entry: SLOTS[matched].models[0] };
				if (!(await switchModel(ctx, matched, pick.idx))) {
					ctx.ui.notify(`${pick.entry.provider}/${pick.entry.model} not enabled`, "error");
					return;
				}
			}

			showTable(ctx, quota);
		},
	});

	pi.registerShortcut(Key.ctrlShift("u"), {
		description: "Cycle model within current slot",
		handler: async (ctx) => {
			if (!slot) {
				ctx.ui.notify("No active slot. Use /slot first.", "info");
				return;
			}
			const quota = readQuota();
			const models = SLOTS[slot].models;
			const pick = nextAvailable(slot, modelIdx, quota, ctx);
			if (!pick) {
				ctx.ui.notify(`All models in ${slot} exhausted or disabled. /slot reset to retry.`, "warning");
				return;
			}
			if (!(await switchModel(ctx, slot, pick.idx))) {
				ctx.ui.notify(`${pick.entry.provider}/${pick.entry.model} not enabled`, "error");
				return;
			}
			const tag = quotaTag(pick.entry.path, quota);
			ctx.ui.notify(`${slot} [${modelIdx + 1}/${models.length}] → ${pick.entry.model}${tag ? ` ${tag}` : ""}`, "info");
		},
	});

	pi.on("before_agent_start", (event) => {
		// Only inject the slot prompt when the active model is the one the slot
		// selected. If the user changed models via /model or Ctrl+P, the slot
		// prompt no longer matches and would mislead the model.
		if (!slot || !slotOwnsModel) return;
		const entry = currentEntry();
		if (entry) return { systemPrompt: `${event.systemPrompt}\n\n${entry.prompt}` };
	});

	/**
	 * Mark `entry` exhausted and auto-cycle to the next available model in the
	 * current slot. Deduped so a retry storm doesn't cascade multiple switches.
	 * Returns true if a fallback was actually switched to.
	 */
	async function failOver(entry: ModelEntry, ctx: any): Promise<boolean> {
		if (entry.provider === "opencode-go" && opencodeGoHasAlternate()) {
			return false;
		}
		const key = entryKey(entry);
		const now = Date.now();
		if (lastFailoverKey === key && now - lastFailoverAt < FAILOVER_DEDUPE_MS) {
			return false;
		}
		lastFailoverKey = key;
		lastFailoverAt = now;

		exhausted.set(key, now);
		const quota = readQuota(true);
		if (!slot) return false;
		const pick = nextAvailable(slot, modelIdx, quota, ctx);
		if (!pick) {
			ctx.ui.notify(`${slot}: ${entry.model} exhausted, no fallback available. /slot reset to retry.`, "warning");
			return false;
		}
		if (await switchModel(ctx, slot, pick.idx)) {
			const tag = quotaTag(pick.entry.path, quota);
			ctx.ui.notify(`${slot}: ${entry.model} exhausted → ${pick.entry.model}${tag ? ` ${tag}` : ""}`, "info");
			return true;
		}
		return false;
	}

	// Proactive failover: catch 429/403 at the HTTP layer before the message
	// fully errors out, so the retry lands on a fresh model.
	pi.on("after_provider_response", async (event, ctx) => {
		if (event.status !== 429 && event.status !== 402 && event.status !== 403) return;
		if (!slot || !slotOwnsModel) return;
		const entry = currentEntry();
		if (!entry) return;
		const active = ctx.model;
		if (!active || active.provider !== entry.provider || active.id !== entry.model) return;
		await failOver(entry, ctx);
	});

	// Detect quota exhaustion on the active slot model and auto-cycle.
	pi.on("message_end", async (event, ctx) => {
		const message = event.message as any;
		if (message?.role !== "assistant") return;
		if (message?.stopReason !== "error") return;
		if (!slot || !slotOwnsModel) return;

		const entry = currentEntry();
		if (!entry) return;
		// Only react if the error came from the slot's own model.
		const active = ctx.model;
		if (!active || active.provider !== entry.provider || active.id !== entry.model) return;

		const err = String(message.errorMessage ?? "");
		if (!QUOTA_ERROR_RE.test(err)) return;

		await failOver(entry, ctx);
	});

	// If the user changes model via /model or Ctrl+P, stop injecting the slot
	// prompt — it no longer describes the active model's role.
	pi.on("model_select", async (event, ctx) => {
		if (event.source === "restore") {
			// On session restore, let restore() reconcile ownership instead.
			return;
		}
		const entry = currentEntry();
		const matches =
			!!entry &&
			event.model.provider === entry.provider &&
			event.model.id === entry.model;
		slotOwnsModel = matches;
		updateFooter(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		restore(ctx);
		updateFooter(ctx);
	});

	pi.on("session_shutdown", () => {
		// Footer is owned by the runtime being torn down; nothing to clear
		// across a plain reload. Reset in-memory failover dedupe so the next
		// session starts clean.
		lastFailoverKey = undefined;
		lastFailoverAt = 0;
	});
}
