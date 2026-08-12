import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface AgySessionRecord {
  last_conversation_id?: string;
  last_model?: string;
  updated_at?: string;
}

type SessionStore = Record<string, AgySessionRecord>;

const STORE_PATH = path.join(os.homedir(), ".pi", "agent", "agy-sessions.json");

async function loadStore(): Promise<SessionStore> {
  try {
    return JSON.parse(await readFile(STORE_PATH, "utf8")) as SessionStore;
  } catch {
    return {};
  }
}

async function saveStore(store: SessionStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function getSession(dir: string): Promise<AgySessionRecord | undefined> {
  const store = await loadStore();
  return store[dir];
}

export async function saveSession(
  dir: string,
  conversationId: string,
  model?: string,
): Promise<void> {
  const store = await loadStore();
  store[dir] = {
    last_conversation_id: conversationId,
    last_model: model,
    updated_at: new Date().toISOString(),
  };
  await saveStore(store);
}
