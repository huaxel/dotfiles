const chains = new Map<string, Promise<void>>();

/** Serialize agy_execute calls that share the same working directory. */
export async function withDirLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(dir) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  chains.set(dir, tail);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (chains.get(dir) === tail) chains.delete(dir);
  }
}
