import type { PracticeEntry } from '../model/types';
import { localDay } from '../db/repo';
import { locale } from '../i18n';

export const STAR_SECONDS = 60;

export type WeekDay = { day: string; label: string; short: string; practised: boolean; today: boolean };

/** Monday–Sunday of the current week, with a star on days with at least a minute of playback. */
export function thisWeek(entries: PracticeEntry[], now = new Date()): WeekDay[] {
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.day, (totals.get(e.day) ?? 0) + e.seconds);
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const today = localDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const day = localDay(d);
    return {
      day,
      label: d.toLocaleDateString(locale(), { weekday: 'long' }),
      short: d.toLocaleDateString(locale(), { weekday: 'narrow' }),
      practised: (totals.get(day) ?? 0) >= STAR_SECONDS,
      today: day === today,
    };
  });
}
