import { useSyncExternalStore } from 'react';

let needRefresh = false;
let update: ((reload?: boolean) => Promise<void>) | null = null;
const subs = new Set<() => void>();

/** Register the service worker (production builds only) and remember when an update is waiting. */
export async function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  update = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      subs.forEach((f) => f());
    },
  });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => needRefresh);
}

export async function applyUpdate(flush: () => Promise<void>) {
  await flush();
  await update?.(true);
}
