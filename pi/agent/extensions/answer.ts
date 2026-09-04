/**
 * Q&A extraction hook - extracts questions from assistant responses
 *
 * Custom interactive TUI for answering questions.
 *
 * Demonstrates the "prompt generator" pattern with custom TUI:
 * 1. /answer command gets the last assistant message
 * 2. Shows a spinner while extracting questions as structured JSON
 * 3. Presents an interactive TUI to navigate and answer questions
 * 4. Submits the compiled answers when done
 */

// pi 0.84.1 exports `complete` only from the compat subpath (root export lands in a later release).
import { complete, parseJsonWithRepair, type Model, type Api, type UserMessage } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	type Component,
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// Structured output format for question extraction
interface ExtractedQuestion {
	question: string;
	context?: string;
	options?: string[];
}

interface ExtractionResult {
	questions: ExtractedQuestion[];
}

type ExtractionOutcome =
	| { status: "ok"; result: ExtractionResult }
	| { status: "cancelled" }
	| { status: "error"; message: string };

const SYSTEM_PROMPT = `You are a question extractor. Given text from a conversation, extract any questions that need answering.

Output a JSON object with this structure:
{
  "questions": [
    {
      "question": "The question text",
      "context": "Optional context that helps answer the question",
      "options": ["Optional", "choice", "list"]
    }
  ]
}

Rules:
- Extract all questions that require user input
- Skip rhetorical questions and questions already answered in the conversation
- Skip questions inside code blocks, quoted text, or examples
- Keep questions in the order they appeared
- Be concise with question text
- Include context only when it provides essential information for answering
- For multiple-choice questions, include an options array with 2-6 concise choices. Omit options for free-form questions.
- If no questions are found, return {"questions": []}

Example output:
{
  "questions": [
    {
      "question": "What is your preferred database?",
      "context": "We can only configure MySQL and PostgreSQL because of what is implemented.",
      "options": ["MySQL", "PostgreSQL"]
    },
    {
      "question": "Should we use TypeScript or JavaScript?"
    }
  ]
}`;

// Extraction model preference: gpt-5.6-luna via openai-codex (OAuth),
// then the current model. OpenCode Go is intentionally not a default provider.
// (Upstream prefers Codex mini / claude-haiku; adapted to configured providers.)
const EXTRACTION_MODELS: Array<[provider: string, modelId: string]> = [
	["openai-codex", "gpt-5.6-luna"],
];

// Quota-aware resolver (agentq infra): prints {"model": "provider/model"} for
// the small tier with headroom. Used first when available; falls back to
// EXTRACTION_MODELS.
const QUOTA_RESOLVER_PATH = path.resolve(
	process.env.HOME ?? "/home/juan",
	"projects/agentq/bin/resolve-model.sh",
);

const execFileAsync = promisify(execFile);

async function resolveQuotaModel(
	modelRegistry: ModelRegistry,
): Promise<Model<Api> | null> {
	if (!existsSync(QUOTA_RESOLVER_PATH)) {
		return null;
	}
	try {
		const { stdout } = await execFileAsync(QUOTA_RESOLVER_PATH, ["small"], {
			timeout: 5000,
		});
		const parsed = JSON.parse(stdout) as { model?: unknown };
		if (typeof parsed.model !== "string") {
			return null;
		}
		const slash = parsed.model.indexOf("/");
		if (slash <= 0 || slash === parsed.model.length - 1) {
			return null;
		}
		const provider = parsed.model.slice(0, slash);
		const modelId = parsed.model.slice(slash + 1);
		const model = modelRegistry.find(provider, modelId);
		if (!model) {
			return null;
		}
		const auth = await modelRegistry.getApiKeyAndHeaders(model);
		return auth.ok ? model : null;
	} catch {
		return null;
	}
}

/**
 * Prefer a fast configured extraction model, then the current model.
 */
async function selectExtractionModel(
	currentModel: Model<Api>,
	modelRegistry: ModelRegistry,
): Promise<Model<Api>> {
	const quotaModel = await resolveQuotaModel(modelRegistry);
	if (quotaModel) {
		return quotaModel;
	}
	for (const [provider, modelId] of EXTRACTION_MODELS) {
		const model = modelRegistry.find(provider, modelId);
		if (!model) {
			continue;
		}
		const auth = await modelRegistry.getApiKeyAndHeaders(model);
		if (auth.ok) {
			return model;
		}
	}

	return currentModel;
}

function toExtractedQuestion(value: unknown): ExtractedQuestion | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const question = record.question;
	const context = record.context;
	if (typeof question !== "string") {
		return null;
	}
	if (context !== undefined && context !== null && typeof context !== "string") {
		return null;
	}
	let options: string[] | undefined;
	if (Array.isArray(record.options)) {
		const cleaned = record.options
			.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
			.map((o) => o.trim())
			.slice(0, 6);
		if (cleaned.length >= 2) {
			options = cleaned;
		}
	}
	const result: ExtractedQuestion =
		typeof context === "string" && context.length > 0 ? { question, context } : { question };
	if (options) {
		result.options = options;
	}
	return result;
}

function toExtractionResult(value: unknown): ExtractionResult | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const record = value as Record<string, unknown>;
	if (!Array.isArray(record.questions)) {
		return null;
	}
	const questions: ExtractedQuestion[] = [];
	for (const question of record.questions) {
		const extractedQuestion = toExtractedQuestion(question);
		if (!extractedQuestion) {
			return null;
		}
		questions.push(extractedQuestion);
	}
	return { questions };
}

interface AnswerDraft {
	questions: ExtractedQuestion[];
	answers: string[];
}

function questionsMatch(a: ExtractedQuestion[], b: ExtractedQuestion[]): boolean {
	return a.length === b.length && a.every((question, index) =>
		question.question.trim().replace(/\s+/g, " ") ===
			b[index]?.question.trim().replace(/\s+/g, " "),
	);
}

function getDraftPath(ctx: ExtensionContext): string | null {
	const sessionFile = ctx.sessionManager.getSessionFile();
	return sessionFile ? `${sessionFile}.answer-drafts.json` : null;
}

async function loadAnswerDraft(draftPath: string): Promise<AnswerDraft | null> {
	try {
		const raw = await fs.readFile(draftPath, "utf8");
		const parsed = JSON.parse(raw) as Partial<AnswerDraft> | null;
		if (!parsed || !Array.isArray(parsed.answers)) {
			return null;
		}
		const answers = parsed.answers.filter((a): a is string => typeof a === "string");
		const questions = Array.isArray(parsed.questions)
			? parsed.questions.filter(
					(q): q is ExtractedQuestion =>
						typeof q === "object" &&
						q !== null &&
						typeof (q as { question?: unknown }).question === "string",
				)
			: [];
		return { questions, answers };
	} catch {
		return null;
	}
}

async function saveAnswerDraft(
	draftPath: string,
	questions: ExtractedQuestion[],
	answers: string[],
): Promise<void> {
	await fs.mkdir(path.dirname(draftPath), { recursive: true });
	await fs.writeFile(
		draftPath,
		JSON.stringify({ questions, answers }, null, 2),
		"utf8",
	);
}

/**
 * Parse the JSON response from the LLM.
 */
function parseExtractionResult(text: string): ExtractionResult | null {
	const candidates: string[] = [];
	const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		candidates.push(jsonMatch[1].trim());
	}

	const trimmed = text.trim();
	candidates.push(trimmed);

	const firstBrace = trimmed.indexOf("{");
	const lastBrace = trimmed.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
	}

	for (const candidate of candidates) {
		try {
			const result = toExtractionResult(parseJsonWithRepair<unknown>(candidate));
			if (result) {
				return result;
			}
		} catch {
			// Try the next candidate.
		}
	}

	return null;
}

/**
 * Interactive Q&A component for answering extracted questions
 */
class QnAComponent implements Component {
	private questions: ExtractedQuestion[];
	private answers: string[];
	private currentIndex: number = 0;
	private editor: Editor;
	private tui: TUI;
	private onDone: (result: string | null) => void;
	private showingConfirmation: boolean = false;

	// Cache
	private cachedWidth?: number;
	private cachedLines?: string[];

	// Colors - using proper reset sequences
	private dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
	private bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
	private cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
	private green = (s: string) => `\x1b[32m${s}\x1b[0m`;
	private yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
	private gray = (s: string) => `\x1b[90m${s}\x1b[0m`;

	constructor(
		questions: ExtractedQuestion[],
		tui: TUI,
		onDone: (result: string | null) => void,
		initialAnswers?: string[],
	) {
		this.questions = questions;
		this.answers =
			initialAnswers && initialAnswers.length === questions.length
				? initialAnswers.map((a) => a ?? "")
				: questions.map(() => "");
		this.tui = tui;
		this.onDone = onDone;

		// Create a minimal theme for the editor
		const editorTheme: EditorTheme = {
			borderColor: this.dim,
			selectList: {
				selectedPrefix: this.cyan,
				selectedText: (s: string) => `\x1b[44m${s}\x1b[0m`,
				description: this.gray,
				scrollInfo: this.dim,
				noMatch: this.yellow,
			},
		};

		this.editor = new Editor(tui, editorTheme);
		// Disable the editor's built-in submit (which clears the editor)
		// We'll handle Enter ourselves to preserve the text
		this.editor.disableSubmit = true;
		this.editor.onChange = () => {
			this.invalidate();
			this.tui.requestRender();
		};
	}

	private allQuestionsAnswered(): boolean {
		this.saveCurrentAnswer();
		return this.answers.every((a) => (a?.trim() || "").length > 0);
	}

	private saveCurrentAnswer(): void {
		this.answers[this.currentIndex] = this.editor.getText();
	}

	private navigateTo(index: number): void {
		if (index < 0 || index >= this.questions.length) return;
		this.saveCurrentAnswer();
		this.currentIndex = index;
		this.editor.setText(this.answers[index] || "");
		this.invalidate();
	}

	private submit(): void {
		this.saveCurrentAnswer();

		// Build the response text
		const parts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const q = this.questions[i];
			const a = this.answers[i]?.trim() || "(no answer)";
			parts.push(`Q: ${q.question}`);
			if (q.context) {
				parts.push(`> ${q.context}`);
			}
			parts.push(`A: ${a}`);
			parts.push("");
		}

		this.onDone(parts.join("\n").trim());
	}

	private cancel(): void {
		this.onDone(null);
	}

	getAnswers(): string[] {
		this.saveCurrentAnswer();
		return [...this.answers];
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		// Handle confirmation dialog
		if (this.showingConfirmation) {
			if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
				this.submit();
				return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
				this.showingConfirmation = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			return;
		}

		// Global navigation and commands
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}

		// Tab / Shift+Tab for navigation
		if (matchesKey(data, Key.tab)) {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, Key.shift("tab"))) {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
			}
			return;
		}

		// Arrow up/down for question navigation when editor is empty
		// (Editor handles its own cursor navigation when there's content)
		if (matchesKey(data, Key.up) && this.editor.getText() === "") {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
				return;
			}
		}
		if (matchesKey(data, Key.down) && this.editor.getText() === "") {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
				return;
			}
		}

		// Handle Enter ourselves (editor's submit is disabled)
		// Plain Enter moves to next question or shows confirmation on last question
		// Shift+Enter adds a newline (handled by editor)
		if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
			this.saveCurrentAnswer();
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
			} else {
				// On last question - show confirmation
				this.showingConfirmation = true;
			}
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Digit keys pick an option when the current question has options and
		// the editor is empty (so free-form typing is never hijacked).
		const currentOptions = this.questions[this.currentIndex].options;
		if (currentOptions && currentOptions.length > 0 && this.editor.getText() === "") {
			const digitMatch = data.match(/^([1-9])$/);
			if (digitMatch) {
				const index = Number(digitMatch[1]) - 1;
				if (index < currentOptions.length) {
					this.editor.setText(currentOptions[index]);
					this.invalidate();
					this.tui.requestRender();
					return;
				}
			}
		}

		// Pass to editor
		this.editor.handleInput(data);
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const boxWidth = Math.min(width - 4, 120); // Allow wider box
		const contentWidth = boxWidth - 4; // 2 chars padding on each side

		// Helper to create horizontal lines (dim the whole thing at once)
		const horizontalLine = (count: number) => "─".repeat(count);

		// Helper to create a box line
		const boxLine = (content: string, leftPad: number = 2): string => {
			const paddedContent = " ".repeat(leftPad) + content;
			const contentLen = visibleWidth(paddedContent);
			const rightPad = Math.max(0, boxWidth - contentLen - 2);
			return this.dim("│") + paddedContent + " ".repeat(rightPad) + this.dim("│");
		};

		const emptyBoxLine = (): string => {
			return this.dim("│") + " ".repeat(boxWidth - 2) + this.dim("│");
		};

		const padToWidth = (line: string): string => {
			const len = visibleWidth(line);
			return line + " ".repeat(Math.max(0, width - len));
		};

		// Title
		lines.push(padToWidth(this.dim("╭" + horizontalLine(boxWidth - 2) + "╮")));
		const title = `${this.bold(this.cyan("Questions"))} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`;
		lines.push(padToWidth(boxLine(title)));
		lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));

		// Progress indicator
		const progressParts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const answered = (this.answers[i]?.trim() || "").length > 0;
			const current = i === this.currentIndex;
			if (current) {
				progressParts.push(this.cyan("●"));
			} else if (answered) {
				progressParts.push(this.green("●"));
			} else {
				progressParts.push(this.dim("○"));
			}
		}
		lines.push(padToWidth(boxLine(progressParts.join(" "))));
		lines.push(padToWidth(emptyBoxLine()));

		// Current question
		const q = this.questions[this.currentIndex];
		const questionText = `${this.bold("Q:")} ${q.question}`;
		const wrappedQuestion = wrapTextWithAnsi(questionText, contentWidth);
		for (const line of wrappedQuestion) {
			lines.push(padToWidth(boxLine(line)));
		}

		// Context if present
		if (q.context) {
			lines.push(padToWidth(emptyBoxLine()));
			const contextText = this.gray(`> ${q.context}`);
			const wrappedContext = wrapTextWithAnsi(contextText, contentWidth - 2);
			for (const line of wrappedContext) {
				lines.push(padToWidth(boxLine(line)));
			}
		}

		// Options if present (digit-selectable)
		if (q.options && q.options.length > 0) {
			lines.push(padToWidth(emptyBoxLine()));
			const optionLines = q.options.map(
				(option, i) => `${this.green(`${i + 1}`)} ${option}`,
			);
			const optionsText = optionLines.join("   ");
			const wrappedOptions = wrapTextWithAnsi(optionsText, contentWidth - 2);
			for (const line of wrappedOptions) {
				lines.push(padToWidth(boxLine(line)));
			}
			lines.push(padToWidth(boxLine(this.dim("press a number to pick"))));
		}

		lines.push(padToWidth(emptyBoxLine()));

		// Render the editor component (multi-line input) with padding
		// Skip the first and last lines (editor's own border lines)
		const answerPrefix = this.bold("A: ");
		const editorWidth = contentWidth - 4 - 3; // Extra padding + space for "A: "
		const editorLines = this.editor.render(editorWidth);
		for (let i = 1; i < editorLines.length - 1; i++) {
			if (i === 1) {
				// First content line gets the "A: " prefix
				lines.push(padToWidth(boxLine(answerPrefix + editorLines[i])));
			} else {
				// Subsequent lines get padding to align with the first line
				lines.push(padToWidth(boxLine("   " + editorLines[i])));
			}
		}

		lines.push(padToWidth(emptyBoxLine()));

		// Confirmation dialog or footer with controls
		if (this.showingConfirmation) {
			lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
			const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter/y to confirm, Esc/n to cancel)")}`;
			lines.push(padToWidth(boxLine(truncateToWidth(confirmMsg, contentWidth))));
		} else {
			lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
			const controls = `${this.dim("Tab/Enter")} next · ${this.dim("Shift+Tab")} prev · ${this.dim("Shift+Enter")} newline · ${this.dim("Esc")} cancel`;
			lines.push(padToWidth(boxLine(truncateToWidth(controls, contentWidth))));
		}
		lines.push(padToWidth(this.dim("╰" + horizontalLine(boxWidth - 2) + "╯")));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	const answerHandler = async (ctx: ExtensionContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("answer requires interactive mode", "error");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("No model selected", "error");
				return;
			}

			// Find the last assistant message on the current branch
			const branch = ctx.sessionManager.getBranch();
			let lastAssistantText: string | undefined;

			for (let i = branch.length - 1; i >= 0; i--) {
				const entry = branch[i];
				if (entry.type === "message") {
					const msg = entry.message;
					if ("role" in msg && msg.role === "assistant") {
						if (msg.stopReason !== "stop") {
							ctx.ui.notify(`Last assistant message incomplete (${msg.stopReason})`, "error");
							return;
						}
						const textParts = msg.content
							.filter((c): c is { type: "text"; text: string } => c.type === "text")
							.map((c) => c.text);
						if (textParts.length > 0) {
							lastAssistantText = textParts.join("\n");
							break;
						}
					}
				}
			}

			if (!lastAssistantText) {
				ctx.ui.notify("No assistant messages found", "error");
				return;
			}

			// Select the best model for extraction.
			const extractionModel = await selectExtractionModel(ctx.model, ctx.modelRegistry);

			// Run extraction with loader UI
			const extractionOutcome = await ctx.ui.custom<ExtractionOutcome>((tui, theme, _kb, done) => {
				const loader = new BorderedLoader(tui, theme, `Extracting questions using ${extractionModel.id}...`);
				loader.onAbort = () => done({ status: "cancelled" });

				const doExtract = async (): Promise<ExtractionOutcome> => {
					const auth = await ctx.modelRegistry.getApiKeyAndHeaders(extractionModel);
					if (auth.ok === false) {
						return { status: "error", message: auth.error };
					}
					const userMessage: UserMessage = {
						role: "user",
						content: [{ type: "text", text: lastAssistantText! }],
						timestamp: Date.now(),
					};

					const response = await complete(
						extractionModel,
						{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
						{ apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
					);

					if (response.stopReason === "aborted") {
						return { status: "cancelled" };
					}
					if (response.stopReason === "error") {
						return { status: "error", message: response.errorMessage ?? "question extraction failed" };
					}

					const responseText = response.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
					const result = parseExtractionResult(responseText);
					if (!result) {
						return { status: "error", message: "question extraction returned invalid JSON" };
					}

					return { status: "ok", result };
				};

				doExtract()
					.then(done)
					.catch((error: unknown) => {
						const message = error instanceof Error ? error.message : String(error);
						done({ status: "error", message });
					});

				return loader;
			});

			if (extractionOutcome.status === "cancelled") {
				ctx.ui.notify("Cancelled", "info");
				return;
			}
			if (extractionOutcome.status === "error") {
				ctx.ui.notify(`Question extraction failed: ${extractionOutcome.message}`, "error");
				return;
			}

			const extractionResult = extractionOutcome.result;
			if (extractionResult.questions.length === 0) {
				ctx.ui.notify("No questions found in the last message", "info");
				return;
			}

			// Restore a previous draft, if any (same question count and some text).
			const draftPath = getDraftPath(ctx);
			let initialAnswers: string[] | undefined;
			if (draftPath) {
				const draft = await loadAnswerDraft(draftPath);
				if (
					draft &&
					questionsMatch(draft.questions, extractionResult.questions) &&
					draft.answers.length === extractionResult.questions.length &&
					draft.answers.some((a) => a.trim())
				) {
					const restore = ctx.hasUI
						? await ctx.ui.confirm("Answer drafts", "Restore your previous answers?")
						: false;
					if (restore) {
						initialAnswers = draft.answers;
					} else {
						await fs.rm(draftPath, { force: true }).catch(() => undefined);
					}
				}
			}

			// Show the Q&A component
			const qnaComponent: { current: QnAComponent | null } = { current: null };
			const answersResult = await ctx.ui.custom<string | null>((tui, _theme, _kb, done) => {
				const component = new QnAComponent(
					extractionResult.questions,
					tui,
					done,
					initialAnswers,
				);
				qnaComponent.current = component;
				return component;
			});

			if (answersResult === null) {
				const savedAnswers = qnaComponent.current?.getAnswers() ?? [];
				if (draftPath && savedAnswers.some((a) => a.trim())) {
					await saveAnswerDraft(draftPath, extractionResult.questions, savedAnswers);
					ctx.ui.notify("Answers saved as draft — run /answer again to restore", "info");
				} else {
					ctx.ui.notify("Cancelled", "info");
				}
				return;
			}

			// Submitted: discard any leftover draft
			if (draftPath) {
				await fs.rm(draftPath, { force: true }).catch(() => undefined);
			}

			// Send the answers directly as a message and trigger a turn.
			// details carries the structured Q/A pairs for tooling; the model
			// consumes the human-readable content.
			const rawAnswers = qnaComponent.current?.getAnswers() ?? [];
			pi.sendMessage(
				{
					customType: "answers",
					content: "I answered your questions in the following way:\n\n" + answersResult,
					display: true,
					details: {
						answers: extractionResult.questions.map((q, i) => ({
							question: q.question,
							answer: rawAnswers[i]?.trim() ?? "",
						})),
					},
				},
				{ triggerTurn: true },
			);
	};

	// Tell the model what customType "answers" messages are (prompt-generator
	// pattern: the /answer flow re-injects answers as a user-style message).
	pi.on("before_agent_start", (event, _ctx) => {
		const note =
			'A message with customType "answers" (content typically starts with "I answered your questions in the following way:") contains the user\'s answers to questions you asked. Treat it as authoritative user input and continue your work accordingly.';
		const existing = event.systemPromptOptions.appendSystemPrompt;
		event.systemPromptOptions.appendSystemPrompt = existing
			? `${existing}\n${note}`
			: note;
	});

	pi.registerCommand("answer", {
		description: "Extract questions from last assistant message into interactive Q&A",
		handler: (_args, ctx) => answerHandler(ctx),
	});

	pi.registerShortcut("ctrl+.", {
		description: "Extract and answer questions",
		handler: answerHandler,
	});
}

// Test-only named exports (the pi loader only uses the default export).
export {
	parseExtractionResult,
	toExtractedQuestion,
	questionsMatch,
	loadAnswerDraft,
	saveAnswerDraft,
};
