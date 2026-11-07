/** Pending debounced saves register here so they are written before the page goes away. */
const flushers = new Set<() => Promise<void> | void>();

export function registerFlush(fn: () => Promise<void> | void): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()));
}

export function installFlushHandlers() {
  window.addEventListener('pagehide', () => void flushAll());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAll();
  });
}
