import { describe, expect, it } from 'vitest';
import { thisWeek } from './week';
import type { PracticeEntry } from '../model/types';

const entry = (day: string, seconds: number): PracticeEntry =>
  ({ id: `${day}-${seconds}`, songId: 's', day, startedAt: `${day}T10:00:00.000Z`, seconds, topSpeed: 100, loops: 0, lastBar: 1 });

describe('thisWeek', () => {
  it('stars days with at least a minute in total', () => {
    const now = new Date(2026, 10, 8, 15); // Sunday 8 Nov 2026
    const days = thisWeek([entry('2026-11-02', 30), entry('2026-11-02', 40), entry('2026-11-04', 59), entry('2026-11-08', 600)], now);
    expect(days.map((d) => d.day)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(days.map((d) => d.practised)).toEqual([true, false, false, false, false, false, true]);
    expect(days.at(-1)!.today).toBe(true);
  });
});
