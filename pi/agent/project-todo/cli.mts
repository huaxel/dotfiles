#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createTodo, ensureTodoExists, formatTodoId, getTodoPath, getTodosDir, isTodoClosed, listTodos, updateTodoStatus, validateTodoId } from "./store.mts";

const usage = `Usage: project-todo <command> [args]
  list [--all] [--json]  List open tasks (or all tasks)
  show TODO-ID         Show metadata and notes
  add "Title" ["Notes"]
  done TODO-ID         Close a task
  view                 Show a live, read-only RexPad checklist (q closes it)

Uses $PI_TODO_PATH or .pi/todos relative to the current directory.`;

function plain(text: string): string {
	return text.replace(/[\p{Cc}\p{Cf}]/gu, " ");
}

async function view(dir: string) {
	if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("view needs a terminal");
	const rexpad = path.join(homedir(), ".local", "bin", "rexpad");
	const scratch = await mkdtemp(path.join(tmpdir(), "project-todo-"));
	const env = {
		HOME: homedir(), XDG_STATE_HOME: scratch,
		TERM: process.env.TERM, COLORTERM: process.env.COLORTERM,
	};
	let last = "";
	async function refresh() {
		const open = (await listTodos(dir)).filter(todo => !isTodoClosed(todo.status));
		const items = open.map(todo => ({
			text: `${formatTodoId(todo.id)}  ${plain(todo.title || "(untitled)")}${todo.assigned_to_session ? "  (claimed)" : ""}`,
			status: "pending",
		}));
		const snapshot = JSON.stringify({ groups: [{ title: open.length ? "Open todos" : "No open todos", items }] });
		if (snapshot === last) return;
		const result = spawnSync(rexpad, ["--list", "project", "set", "--json"], {
			env, input: snapshot, stdio: ["pipe", "ignore", "pipe"], timeout: 4000,
		});
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(result.stderr.toString().trim() || "RexPad could not load the checklist");
		last = snapshot;
	}
	try {
		await refresh();
		const child = spawn(rexpad, ["--list", "project", "view"], { env, stdio: "inherit" });
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		let pending: Promise<void> | undefined;
		const stop = () => { stopped = true; child.kill(); };
		const tick = () => {
			if (stopped) return;
			timer = setTimeout(() => {
				pending = refresh().then(tick, (error) => {
					console.error(`project-todo: ${error.message}`);
					process.exitCode = 1;
					stop();
				});
			}, 1000);
		};
		for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) process.on(signal, stop);
		try {
			tick();
			const [code] = await once(child, "exit");
			if (code) process.exitCode = code;
		} finally {
			stopped = true;
			clearTimeout(timer);
			for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) process.off(signal, stop);
			await pending;
		}
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

async function main([command, ...args]: string[]) {
	if (!command || command === "--help" || command === "-h") { console.log(usage); return; }
	const dir = getTodosDir(process.cwd());
	if (command === "list" && args.every(arg => arg === "--all" || arg === "--json")) {
		const todos = (await listTodos(dir)).filter(todo => args.includes("--all") || !isTodoClosed(todo.status));
		if (args.includes("--json")) console.log(JSON.stringify(todos, null, 2));
		else if (!todos.length) console.log("No todos.");
		else for (const todo of todos) console.log(`${formatTodoId(todo.id)}  ${plain(todo.status)}  ${plain(todo.title)}${todo.assigned_to_session ? "  (claimed)" : ""}`);
		return;
	}
	if (command === "add" && args[0]?.trim() && args.length <= 2) {
		const result = await createTodo(dir, { title: args[0].trim(), body: args[1] });
		if ("error" in result) throw new Error(result.error);
		console.log(formatTodoId(result.id));
		return;
	}
	if ((command === "show" || command === "done") && args.length === 1) {
		const { id } = checkedId(args[0]);
		if (command === "done") {
			const result = await updateTodoStatus(dir, id, "closed", {});
			if ("error" in result) throw new Error(result.error);
			console.log(`${formatTodoId(id)} closed`);
		} else {
			const todo = ensureTodoExists(getTodoPath(dir, id), id);
			if (!todo) throw new Error(`Todo ${formatTodoId(id)} not found`);
			console.log(JSON.stringify(todo, null, 2));
		}
		return;
	}
	if (command === "view" && !args.length) return view(dir);
	throw new Error(usage);
}

function checkedId(arg: string) {
	const result = validateTodoId(arg);
	if ("error" in result) throw new Error(result.error);
	return result;
}

main(process.argv.slice(2)).catch((error) => {
	console.error(`project-todo: ${error.message}`);
	process.exitCode = 1;
});
