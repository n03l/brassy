import { useSyncExternalStore } from 'react';

/** The song last opened in the player or editor (for highlighting its notes in the fingering chart). */
let current: string | null = null;
const subs = new Set<() => void>();

export function setCurrentSong(id: string | null) {
  current = id;
  subs.forEach((f) => f());
}

export function useCurrentSongId(): string | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
}
