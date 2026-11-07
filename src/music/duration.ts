import type { Duration, NoteEvent, Song } from '../model/types';

/** Ticks per quarter note (same resolution alphaTab uses). */
export const TPQ = 960;

const BASE: Record<Duration, number> = { whole: 3840, half: 1920, quarter: 960, eighth: 480, sixteenth: 240 };
const DENOM: Record<Duration, number> = { whole: 1, half: 2, quarter: 4, eighth: 8, sixteenth: 16 };

export function durationTicks(d: Duration, dotted: boolean): number {
  return dotted ? (BASE[d] * 3) / 2 : BASE[d];
}

export function eventTicks(e: Pick<NoteEvent, 'duration' | 'dotted'>): number {
  return durationTicks(e.duration, e.dotted);
}

export function denominator(d: Duration): number {
  return DENOM[d];
}

export function durationFromDenominator(n: number): Duration | undefined {
  return (Object.keys(DENOM) as Duration[]).find((d) => DENOM[d] === n);
}

/** Ticks one bar should hold. */
export function barCapacity(song: Pick<Song, 'beats' | 'beatType'>): number {
  return (song.beats * 4 * TPQ) / song.beatType;
}

export function barTicks(events: readonly NoteEvent[]): number {
  let t = 0;
  for (const e of events) t += eventTicks(e);
  return t;
}

/** All single (optionally dotted) durations, longest first. */
export const DURATION_CHOICES: { duration: Duration; dotted: boolean; ticks: number }[] = (
  ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as Duration[]
)
  .flatMap((d) => [
    { duration: d, dotted: true, ticks: durationTicks(d, true) },
    { duration: d, dotted: false, ticks: durationTicks(d, false) },
  ])
  .sort((a, b) => b.ticks - a.ticks);

/** Exact duration for a tick count, if one exists. */
export function durationForTicks(ticks: number): { duration: Duration; dotted: boolean } | undefined {
  const c = DURATION_CHOICES.find((x) => x.ticks === ticks);
  return c && { duration: c.duration, dotted: c.dotted };
}

/** Split a gap into the fewest plain rests/notes (greedy, longest first, no dots). */
export function splitTicks(ticks: number): Duration[] {
  const out: Duration[] = [];
  let left = ticks;
  for (const d of ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as Duration[]) {
    while (left >= BASE[d]) {
      out.push(d);
      left -= BASE[d];
    }
  }
  return out;
}

/** Beats as a child would count them in this time signature ("3 beats", "2½ beats"). */
export function ticksToBeats(ticks: number, beatType: number): number {
  return ticks / ((4 * TPQ) / beatType);
}
