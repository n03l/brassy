import { useEffect, useRef } from 'react';
import { savePractice, localDay } from '../db/repo';
import { newId } from '../model/ids';
import { registerFlush } from '../app/flush';

/**
 * Log practice while playback runs: seconds actually playing, top speed, loops and the last bar.
 * One entry per visit to the player, saved every 15 s, on pause and when leaving.
 */
export function usePractice(songId: string, playing: boolean, speed: number, loops: number, bar: number) {
  const entry = useRef({ id: newId(), seconds: 0, topSpeed: 0, loops: 0, lastBar: 1, startedAt: '', dirty: false });
  const latest = useRef({ speed, loops, bar });
  latest.current = { speed, loops, bar };

  useEffect(() => {
    const e = entry.current;
    const save = async () => {
      if (!e.dirty || e.seconds < 1) return;
      e.dirty = false;
      try {
        await savePractice({
          id: e.id, songId, day: localDay(new Date(e.startedAt)), startedAt: e.startedAt,
          seconds: e.seconds, topSpeed: e.topSpeed || 100, loops: e.loops, lastBar: e.lastBar,
        });
      } catch {
        /* another tab owns storage, or storage is full: practice logging is best effort */
      }
    };
    const off = registerFlush(save);
    if (!playing) {
      void save();
      return off;
    }
    if (!e.startedAt) e.startedAt = new Date().toISOString();
    let last = performance.now();
    let sinceSave = 0;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(5, (now - last) / 1000);
      last = now;
      e.seconds += dt;
      e.topSpeed = Math.max(e.topSpeed, latest.current.speed);
      e.loops = latest.current.loops;
      e.lastBar = latest.current.bar + 1;
      e.dirty = true;
      sinceSave += dt;
      if (sinceSave >= 15) {
        sinceSave = 0;
        void save();
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      off();
      void save();
    };
  }, [playing, songId]);
}
