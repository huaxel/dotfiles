import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TODO_DIR_NAME = ".pi/todos";
const TODO_PATH_ENV = "PI_TODO_PATH";
const TODO_SETTINGS_NAME = "settings.json";
const TODO_ID_PREFIX = "TODO-";
const TODO_ID_PATTERN = /^[a-f0-9]{8}$/i;
const DEFAULT_TODO_SETTINGS = {
	gc: true,
	gcDays: 7,
};
const LOCK_TTL_MS = 30 * 60 * 1000;
const MIN_LOCK_TTL_MS = 5 * 1000;

export interface TodoFrontMatter {
	id: string;
	title: string;
	tags: string[];
	status: string;
	created_at: string;
	assigned_to_session?: string;
	updated_at?: string;
	due?: string;
}

export interface TodoRecord extends TodoFrontMatter {
	body: string;
}

interface LockInfo {
	id: string;
	pid: number;
	token?: string;
	session?: string | null;
	created_at: string;
}

export interface TodoSettings {
	gc: boolean;
	gcDays: number;
	lockTtlMs?: number;
}

export function formatTodoId(id: string): string {
	return `${TODO_ID_PREFIX}${id}`;
}

export function normalizeTodoId(id: string): string {
	let trimmed = id.trim();
	if (trimmed.startsWith("#")) {
		trimmed = trimmed.slice(1);
	}
	if (trimmed.toUpperCase().startsWith(TODO_ID_PREFIX)) {
		trimmed = trimmed.slice(TODO_ID_PREFIX.length);
	}
	return trimmed;
}

export function validateTodoId(id: string): { id: string } | { error: string } {
	const normalized = normalizeTodoId(id);
	if (!normalized || !TODO_ID_PATTERN.test(normalized)) {
		return { error: "Invalid todo id. Expected TODO-<hex>." };
	}
	return { id: normalized.toLowerCase() };
}

export function displayTodoId(id: string): string {
	return formatTodoId(normalizeTodoId(id));
}

export function isTodoClosed(status: string): boolean {
	return ["closed", "done"].includes(status.toLowerCase());
}

export function clearAssignmentIfClosed(todo: TodoFrontMatter): void {
	if (isTodoClosed(todo.status || "open")) {
		todo.assigned_to_session = undefined;
	}
}

function sortTodos(todos: TodoFrontMatter[]): TodoFrontMatter[] {
	return [...todos].sort((a, b) => {
		const aClosed = isTodoClosed(a.status);
		const bClosed = isTodoClosed(b.status);
		if (aClosed !== bClosed) return aClosed ? 1 : -1;
		const aAssigned = !aClosed && Boolean(a.assigned_to_session);
		const bAssigned = !bClosed && Boolean(b.assigned_to_session);
		if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
		const aDue = a.due ? Date.parse(a.due) : Number.POSITIVE_INFINITY;
		const bDue = b.due ? Date.parse(b.due) : Number.POSITIVE_INFINITY;
		if (Number.isFinite(aDue) && Number.isFinite(bDue) && aDue !== bDue) return aDue - bDue;
		if (Number.isFinite(aDue) !== Number.isFinite(bDue)) return Number.isFinite(aDue) ? -1 : 1;
		return (a.created_at || "").localeCompare(b.created_at || "");
	});
}

export function getTodosDir(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath && overridePath.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return path.resolve(cwd, TODO_DIR_NAME);
}

function getTodoSettingsPath(todosDir: string): string {
	return path.join(todosDir, TODO_SETTINGS_NAME);
}

function normalizeTodoSettings(raw: Partial<TodoSettings>): TodoSettings {
	const gc = raw.gc ?? DEFAULT_TODO_SETTINGS.gc;
	const gcDays =
		typeof raw.gcDays === "number" && Number.isFinite(raw.gcDays)
			? raw.gcDays
			: DEFAULT_TODO_SETTINGS.gcDays;
	const lockTtlMs =
		typeof raw.lockTtlMs === "number" && Number.isFinite(raw.lockTtlMs) && raw.lockTtlMs >= MIN_LOCK_TTL_MS
			? Math.floor(raw.lockTtlMs)
			: undefined;
	return {
		gc: Boolean(gc),
		gcDays: Math.max(0, Math.floor(gcDays)),
		...(lockTtlMs !== undefined ? { lockTtlMs } : {}),
	};
}

export async function readTodoSettings(todosDir: string): Promise<TodoSettings> {
	const settingsPath = getTodoSettingsPath(todosDir);
	let data: Partial<TodoSettings> = {};

	try {
		const raw = await fs.readFile(settingsPath, "utf8");
		data = JSON.parse(raw) as Partial<TodoSettings>;
	} catch {
		data = {};
	}

	return normalizeTodoSettings(data);
}

export function getTodoPath(todosDir: string, id: string): string {
	return path.join(todosDir, `${id}.md`);
}

function getLockPath(todosDir: string, id: string): string {
	return path.join(todosDir, `${id}.lock`);
}

export function parseFrontMatter(text: string, idFallback: string): TodoFrontMatter {
	const data: TodoFrontMatter = {
		id: idFallback,
		title: "",
		tags: [],
		status: "open",
		created_at: "",
		assigned_to_session: undefined,
	};

	const trimmed = text.trim();
	if (!trimmed) return data;

	try {
		const parsed = JSON.parse(trimmed) as Partial<TodoFrontMatter> | null;
		if (!parsed || typeof parsed !== "object") return data;
		if (typeof parsed.id === "string" && parsed.id) data.id = parsed.id;
		if (typeof parsed.title === "string") data.title = parsed.title;
		if (typeof parsed.status === "string" && parsed.status) data.status = parsed.status;
		if (typeof parsed.created_at === "string") data.created_at = parsed.created_at;
		if (typeof parsed.updated_at === "string") data.updated_at = parsed.updated_at;
		if (typeof parsed.due === "string" && parsed.due) data.due = parsed.due;
		if (typeof parsed.assigned_to_session === "string" && parsed.assigned_to_session.trim()) {
			data.assigned_to_session = parsed.assigned_to_session;
		}
		if (Array.isArray(parsed.tags)) {
			data.tags = parsed.tags.filter((tag): tag is string => typeof tag === "string");
		}
	} catch {
		return data;
	}

	return data;
}

function findJsonObjectEnd(content: string): number {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < content.length; i += 1) {
		const char = content[i];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === "\"") {
				inString = false;
			}
			continue;
		}

		if (char === "\"") {
			inString = true;
			continue;
		}

		if (char === "{") {
			depth += 1;
			continue;
		}

		if (char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}

	return -1;
}

export function splitFrontMatter(content: string): { frontMatter: string; body: string } {
	if (!content.startsWith("{")) {
		return { frontMatter: "", body: content };
	}

	const endIndex = findJsonObjectEnd(content);
	if (endIndex === -1) {
		return { frontMatter: "", body: content };
	}

	const frontMatter = content.slice(0, endIndex + 1);
	const body = content.slice(endIndex + 1).replace(/^\r?\n+/, "");
	return { frontMatter, body };
}

export function parseTodoContent(content: string, idFallback: string): TodoRecord {
	const { frontMatter, body } = splitFrontMatter(content);
	const parsed = parseFrontMatter(frontMatter, idFallback);
	return {
		id: idFallback,
		title: parsed.title,
		tags: parsed.tags ?? [],
		status: parsed.status,
		created_at: parsed.created_at,
		assigned_to_session: parsed.assigned_to_session,
		updated_at: parsed.updated_at,
		due: parsed.due,
		body: body ?? "",
	};
}

export function serializeTodo(todo: TodoRecord): string {
	const frontMatter = JSON.stringify(
		{
			id: todo.id,
			title: todo.title,
			tags: todo.tags ?? [],
			status: todo.status,
			created_at: todo.created_at,
			assigned_to_session: todo.assigned_to_session || undefined,
			updated_at: todo.updated_at || undefined,
			due: todo.due || undefined,
		},
		null,
		2,
	);

	const body = todo.body ?? "";
	const trimmedBody = body.replace(/^\n+/, "").replace(/\s+$/, "");
	if (!trimmedBody) return `${frontMatter}\n`;
	return `${frontMatter}\n\n${trimmedBody}\n`;
}

export async function ensureTodosDir(todosDir: string) {
	await fs.mkdir(todosDir, { recursive: true });
}

export async function writeTodoFile(filePath: string, todo: TodoRecord) {
	todo.updated_at = new Date().toISOString();
	await fs.writeFile(filePath, serializeTodo(todo), "utf8");
}

function generateTodoId(todosDir: string): string {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const id = crypto.randomBytes(4).toString("hex");
		const todoPath = getTodoPath(todosDir, id);
		if (!existsSync(todoPath)) return id;
	}
	throw new Error("Failed to generate unique todo id");
}

async function readLockInfo(lockPath: string): Promise<LockInfo | null> {
	try {
		const raw = await fs.readFile(lockPath, "utf8");
		return JSON.parse(raw) as LockInfo;
	} catch {
		return null;
	}
}

export async function acquireLock(
	todosDir: string,
	id: string,
	owner: TodoLockOwner,
	stealStale = false,
): Promise<(() => Promise<void>) | { error: string }> {
	const lockPath = getLockPath(todosDir, id);
	const now = Date.now();
	const session = owner.session ?? null;
	// Per-directory lock TTL override from <todo-dir>/settings.json.
	const settings = await readTodoSettings(todosDir);
	const lockTtlMs = settings.lockTtlMs ?? LOCK_TTL_MS;

	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const handle = await fs.open(lockPath, "wx");
			const token = crypto.randomBytes(16).toString("hex");
			const info: LockInfo = {
				id,
				pid: process.pid,
				token,
				session,
				created_at: new Date(now).toISOString(),
			};
			try {
				await handle.writeFile(JSON.stringify(info, null, 2), "utf8");
				await handle.close();
			} catch (error) {
				await handle.close().catch(() => undefined);
				await fs.unlink(lockPath).catch(() => undefined);
				throw error;
			}
			return async () => {
				try {
					const current = await readLockInfo(lockPath);
					if (current?.token !== token) return;
					await fs.unlink(lockPath);
				} catch {
					// ignore
				}
			};
		} catch (error: unknown) {
			const code =
				error instanceof Error && "code" in error
					? String((error as { code?: unknown }).code)
					: undefined;
			if (code !== "EEXIST") {
				return { error: `Failed to acquire lock: ${error instanceof Error ? error.message : "unknown error"}` };
			}
			const stats = await fs.stat(lockPath).catch(() => null);
			const lockAge = stats ? now - stats.mtimeMs : lockTtlMs + 1;
			if (lockAge <= lockTtlMs) {
				const info = await readLockInfo(lockPath);
				const holder = info?.session ? ` (session ${info.session})` : "";
				return { error: `Todo ${displayTodoId(id)} is locked${holder}. Try again later.` };
			}
			if (stealStale) {
				// force: steal a stale lock without confirmation (works headless)
				await fs.unlink(lockPath).catch(() => undefined);
				continue;
			}
			if (!owner.confirm) {
				return { error: `Todo ${displayTodoId(id)} lock is stale; rerun in interactive mode to steal it.` };
			}
			const ok = await owner.confirm(
				"Todo locked",
				`Todo ${displayTodoId(id)} appears locked. Steal the lock?`,
			);
			if (!ok) {
				return { error: `Todo ${displayTodoId(id)} remains locked.` };
			}
			await fs.unlink(lockPath).catch(() => undefined);
		}
	}

	return { error: `Failed to acquire lock for todo ${displayTodoId(id)}.` };
}

export async function withTodoLock<T>(
	todosDir: string,
	id: string,
	owner: TodoLockOwner,
	fn: () => Promise<T>,
	stealStale = false,
): Promise<T | { error: string }> {
	const lock = await acquireLock(todosDir, id, owner, stealStale);
	if (typeof lock === "object" && "error" in lock) return lock;
	try {
		return await fn();
	} finally {
		await lock();
	}
}

export async function listTodos(todosDir: string): Promise<TodoFrontMatter[]> {
	let entries: string[] = [];
	try {
		entries = await fs.readdir(todosDir);
	} catch {
		return [];
	}

	const todos: TodoFrontMatter[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		const id = entry.slice(0, -3);
		const filePath = path.join(todosDir, entry);
		try {
			const content = await fs.readFile(filePath, "utf8");
			const { frontMatter } = splitFrontMatter(content);
			const parsed = parseFrontMatter(frontMatter, id);
			todos.push({
				id,
				title: parsed.title,
				tags: parsed.tags ?? [],
				status: parsed.status,
				created_at: parsed.created_at,
				assigned_to_session: parsed.assigned_to_session,
				updated_at: parsed.updated_at,
				due: parsed.due,
			});
		} catch {
			// ignore unreadable todo
		}
	}

	return sortTodos(todos);
}

export function ensureTodoExists(filePath: string, id: string): TodoRecord | null {
	if (!existsSync(filePath)) return null;
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
	return parseTodoContent(content, id);
}

export async function appendTodoBody(filePath: string, todo: TodoRecord, text: string): Promise<TodoRecord> {
	const spacer = todo.body.trim().length ? "\n\n" : "";
	todo.body = `${todo.body.replace(/\s+$/, "")}${spacer}${text.trim()}\n`;
	await writeTodoFile(filePath, todo);
	return todo;
}

export async function updateTodoStatus(
	todosDir: string,
	id: string,
	status: string,
	owner: TodoLockOwner,
	stealStale = false,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	if (!existsSync(filePath)) {
		return { error: `Todo ${displayTodoId(id)} not found` };
	}

	const result = await withTodoLock(todosDir, normalizedId, owner, async () => {
		const existing = ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayTodoId(id)} not found` } as const;
		existing.status = status;
		clearAssignmentIfClosed(existing);
		await writeTodoFile(filePath, existing);
		return existing;
	}, stealStale);

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

export interface TodoLockOwner {
	session?: string | null;
	confirm?: (title: string, message: string) => Promise<boolean>;
}

export async function createTodo(
	todosDir: string,
	input: Pick<TodoRecord, "title"> & Partial<Pick<TodoRecord, "status" | "tags" | "body" | "due">>,
	owner: TodoLockOwner = {},
): Promise<TodoRecord | { error: string }> {
	await ensureTodosDir(todosDir);
	const id = generateTodoId(todosDir);
	const todo: TodoRecord = {
		id, title: input.title, status: input.status ?? "open", tags: input.tags ?? [],
		body: input.body ?? "", due: input.due || undefined, created_at: new Date().toISOString(),
	};
	return withTodoLock(todosDir, id, owner, async () => {
		await writeTodoFile(getTodoPath(todosDir, id), todo);
		return todo;
	});
}
