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
		description: "quick fixes — flash → local → umans",
		thinkingLevel: "off",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-flash", path: "go", prompt: "FAST — quick fix. Minimal changes, skip deep analysis." },
			{ provider: "nan", model: "qwen3.6", path: "local", prompt: "FAST — quick fix. Minimal changes, skip deep analysis." },
			{ provider: "umans", model: "umans-kimi-k2.7", path: "umans", prompt: "FAST — quick fix. Minimal changes." },
		],
	},
	work: {
		description: "implement — flash → local → umans → luna",
		thinkingLevel: "off",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-flash", path: "go", prompt: "WORK (flash) — focused implementation. Run tests." },
			{ provider: "nan", model: "qwen3.6", path: "local", prompt: "WORK (local) — focused implementation." },
			{ provider: "umans", model: "umans-kimi-k2.7", path: "umans", prompt: "WORK (umans) — focused implementation. Run tests." },
			{ provider: "openai-codex", model: "gpt-5.6-luna", path: "codex", prompt: "WORK (heavy) — complex. Think through edge cases." },
		],
	},
	think: {
		description: "analyze — pro → glm-5.2 → terra → sol",
		thinkingLevel: "max",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-pro", path: "go", prompt: "THINK (pro) — read fully, explore. Do NOT edit." },
			{ provider: "umans", model: "umans-glm-5.2", path: "umans", prompt: "THINK (glm-5.2) — read fully, trace architecture. Do NOT edit." },
			{ provider: "openai-codex", model: "gpt-5.6-terra", path: "codex", prompt: "THINK (terra) — deep analysis. Do NOT edit." },
			{ provider: "openai-codex", model: "gpt-5.6-sol", path: "codex", prompt: "THINK (sol) — max reasoning. Do NOT edit." },
		],
	},
	review: {
		description: "review — flash → glm-5.2 → pro → commandcode",
		thinkingLevel: "off",
		models: [
			{ provider: "opencode-go", model: "deepseek-v4-flash", path: "go", prompt: "REVIEW (flash) — quick pass. Obvious issues." },
			{ provider: "umans", model: "umans-glm-5.2", path: "umans", prompt: "REVIEW (glm-5.2) — thorough. Cite lines, suggest fixes." },
			{ provider: "opencode-go", model: "deepseek-v4-pro", path: "go", prompt: "REVIEW (pro) — thorough. Cite lines, suggest fixes." },
			{ provider: "commandcode", model: "deepseek/deepseek-v4-pro", path: "go", prompt: "REVIEW (thorough) — security, architecture, style." },
		],
	},
};

const QUOTA_FILE = process.env.PI_QUOTA_FILE
	?? `${homedir()}/projects/sub-roi-tracker/data/quota.json`;

function worstWindow(wins: any[] | undefined) {
	if (!wins?.length) return null;
	let worst = wins[0];
	for (const w of wins) {
		if ((w.usedPercent ?? 0) > (worst.usedPercent ?? 0)) worst = w;
	}
	return { pct: worst.usedPercent ?? 0, label: worst.label || "?", resetsAt: worst.resetsAt ?? null };
}

function readQuota() {
	try {
		if (!existsSync(QUOTA_FILE)) return null;
		const raw = JSON.parse(readFileSync(QUOTA_FILE, "utf8"));
		const out: Record<string, any> = {};
		for (const [p, d] of Object.entries(raw.paths || {}) as any) {
			const w = worstWindow(d.windows);
			if (w) out[p] = w;
		}
		return out;
	} catch { return null; }
}

function quotaTag(path: string, quota: Record<string, any> | null): string {
	if (path === "local") return "";
	if (!quota?.[path]) return " ?";
	const q = quota[path];
	if (q.resetsAt && Date.parse(q.resetsAt) <= Date.now()) return " ↻";
	if (q.pct >= 95) return ` !${q.label}`;
	if (q.pct >= 85) return ` ${q.pct}% ${q.label}`;
	if (q.pct > 0) return ` ${q.pct}%`;
	return "";
}

export default function (pi: ExtensionAPI) {
	let slot: string | undefined;
	let modelIdx = 0;

	function currentEntry(): ModelEntry | undefined {
		if (!slot) return undefined;
		return SLOTS[slot]?.models[modelIdx];
	}

	async function switchModel(ctx: any, slotName: string, index: number): Promise<boolean> {
		const entry = SLOTS[slotName]?.models[index];
		if (!entry) return false;
		const m = ctx.modelRegistry.find(entry.provider, entry.model);
		if (!m || !(await pi.setModel(m))) return false;
		pi.setThinkingLevel(SLOTS[slotName].thinkingLevel);
		slot = slotName;
		modelIdx = index;
		return true;
	}

	function showTable(ctx: any, quota: Record<string, any> | null) {
		const lines: string[] = [];
		for (const [s, entry] of Object.entries(SLOTS)) {
			const active = s === slot ? "→" : " ";
			const models = entry.models.map((m, i) => {
				const tag = quotaTag(m.path, quota);
				const name = `${m.model}${tag}`;
				if (s === slot && i === modelIdx) return `[${name}]`;
				return name;
			}).join(" | ");
			lines.push(`${active} ${s.padEnd(6)} ${entry.description}`);
			lines.push(`        ${models}`);
		}
		ctx.ui.notify(lines.join("\n"), "info");
	}

	function matchSlot(input: string): string | undefined {
		if (SLOTS[input]) return input;
		const matches = Object.keys(SLOTS).filter((k) => k.startsWith(input));
		return matches.length === 1 ? matches[0] : undefined;
	}

	pi.registerCommand("slot", {
		description: "Switch role+model. /slot fast|work|think|review, or /slot for overview. Ctrl+Shift+U cycles models in current slot.",
		handler: async (args, ctx) => {
			const input = args.trim().toLowerCase();
			const quota = readQuota();

			if (input) {
				const matched = matchSlot(input);
				if (!matched) {
					ctx.ui.notify(`Unknown slot: ${input}. Try: ${Object.keys(SLOTS).join(", ")}`, "error");
					return;
				}
				if (!(await switchModel(ctx, matched, 0))) {
					ctx.ui.notify(`${SLOTS[matched].models[0].provider}/${SLOTS[matched].models[0].model} not enabled`, "error");
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
			const models = SLOTS[slot].models;
			const nextIdx = (modelIdx + 1) % models.length;
			const m = models[nextIdx];
			if (!(await switchModel(ctx, slot, nextIdx))) {
				ctx.ui.notify(`${m.provider}/${m.model} not enabled`, "error");
				return;
			}
			const quota = readQuota();
			const tag = quotaTag(m.path, quota);
			ctx.ui.notify(`${slot} [${modelIdx + 1}/${models.length}] → ${m.model}${tag ? ` ${tag}` : ""}`, "info");
		},
	});

	pi.on("before_agent_start", (event) => {
		const entry = currentEntry();
		if (entry) return { systemPrompt: `${event.systemPrompt}\n\n${entry.prompt}` };
	});
}
