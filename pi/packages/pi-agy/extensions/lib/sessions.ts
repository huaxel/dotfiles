import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export interface AgySessionRecord {
  last_conversation_id?: string;
  last_model?: string;
  updated_at?: string;
}

type SessionStore = Record<string, AgySessionRecord>;

const STORE_PATH = path.join(os.homedir(), ".pi", "agent", "agy-sessions.json");

export interface AgySessionStore {
  getSession(dir: string): Promise<AgySessionRecord | undefined>;
  saveSession(dir: string, conversationId: string, model?: string): Promise<void>;
}

/** Create a session store; the optional path makes persistence testable. */
export function createSessionStore(storePath = STORE_PATH): AgySessionStore {
  let mutationChain = Promise.resolve();

  async function loadStore(): Promise<SessionStore> {
    try {
      const parsed: unknown = JSON.parse(await readFile(storePath, "utf8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as SessionStore)
        : {};
    } catch {
      return {};
    }
  }

  async function saveStore(store: SessionStore): Promise<void> {
    await mkdir(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      await chmod(tempPath, 0o600);
      await rename(tempPath, storePath);
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  }

  async function getSession(dir: string): Promise<AgySessionRecord | undefined> {
    const store = await loadStore();
    return store[path.resolve(dir)];
  }

  function saveSession(dir: string, conversationId: string, model?: string): Promise<void> {
    const operation = mutationChain.then(async () => {
      const store = await loadStore();
      store[path.resolve(dir)] = {
        last_conversation_id: conversationId,
        last_model: model,
        updated_at: new Date().toISOString(),
      };
      await saveStore(store);
    });
    mutationChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  return { getSession, saveSession };
}

const defaultStore = createSessionStore();

export function getSession(dir: string): Promise<AgySessionRecord | undefined> {
  return defaultStore.getSession(dir);
}

export function saveSession(dir: string, conversationId: string, model?: string): Promise<void> {
  return defaultStore.saveSession(dir, conversationId, model);
}
