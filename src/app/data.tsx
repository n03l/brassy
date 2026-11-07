import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadPracticeSince, loadSongs, localDay, onDataChanged } from '../db/repo';
import type { PracticeEntry, Song } from '../model/types';

type Data = {
  ready: boolean;
  songs: Song[];
  unreadable: number;
  /** Practice entries from the last 8 days (enough for "This week" and "Keep going"). */
  recentPractice: PracticeEntry[];
  reload: () => Promise<void>;
  error?: string;
};

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Data, 'reload'>>({ ready: false, songs: [], unreadable: 0, recentPractice: [] });

  const reload = useCallback(async () => {
    try {
      const [{ songs, unreadable }, recentPractice] = await Promise.all([
        loadSongs(),
        loadPracticeSince(localDay(new Date(Date.now() - 8 * 86400_000))),
      ]);
      setState({ ready: true, songs, unreadable, recentPractice });
    } catch (e) {
      setState((s) => ({ ...s, ready: true, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  useEffect(() => {
    void reload();
    return onDataChanged(() => void reload());
  }, [reload]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
