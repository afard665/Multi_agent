const tails = new Map<string, Promise<void>>();

/**
 * In-process async mutex keyed by file path (or any string key).
 *
 * This prevents concurrent read-modify-write races and temp-file rename collisions
 * within a single Node process handling multiple requests.
 */
export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  // publish our tail before waiting so the next caller queues behind us
  tails.set(key, current);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === current) tails.delete(key);
  }
}