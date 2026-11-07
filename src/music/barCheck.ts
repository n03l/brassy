import type { Bar, Song } from '../model/types';
import { barCapacity, barTicks, durationForTicks, eventTicks, splitTicks, ticksToBeats } from './duration';
import { t } from '../i18n';

export type BarIssue = { bar: number; ticks: number; capacity: number; kind: 'short' | 'long' };

/** Every bar whose total doesn't match the time signature. */
export function checkBars(song: Song): BarIssue[] {
  const capacity = barCapacity(song);
  const out: BarIssue[] = [];
  song.bars.forEach((b, i) => {
    const ticks = barTicks(b.events);
    // A pickup bar may be short, but not empty or too long.
    if (ticks < capacity && !(b.pickup && ticks > 0)) out.push({ bar: i, ticks, capacity, kind: 'short' });
    else if (ticks > capacity) out.push({ bar: i, ticks, capacity, kind: 'long' });
  });
  return out;
}

/** "3", "2½", "1¼"… */
export function beatsText(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const f = Math.abs(frac - 0.5) < 1e-6 ? '½' : Math.abs(frac - 0.25) < 1e-6 ? '¼' : Math.abs(frac - 0.75) < 1e-6 ? '¾' : frac > 1e-6 ? `.${String(Math.round(frac * 100)).padStart(2, '0')}` : '';
  return whole === 0 && f ? f : `${whole}${f}`;
}

export function issueMessage(issue: BarIssue, song: Pick<Song, 'beatType'>): string {
  const has = ticksToBeats(issue.ticks, song.beatType);
  const needs = ticksToBeats(issue.capacity, song.beatType);
  const word = (n: number) => (Math.abs(n - 1) < 1e-9 ? t('bar.beat') : t('bar.beats'));
  if (issue.ticks === 0) return t('bar.empty', issue.bar + 1, beatsText(needs), word(needs));
  return t('bar.has', issue.bar + 1, beatsText(has), word(has), beatsText(needs));
}


/** Label for the "fill with rests" fix, e.g. "Add a quarter rest". */
export function fillLabel(issue: BarIssue): string {
  const gap = issue.capacity - issue.ticks;
  const one = durationForTicks(gap);
  if (one) {
    const name = t(`dur.${one.duration}`);
    return t('bar.fillOne', one.dotted ? t('dur.dotted', name) : name);
  }
  return t('bar.fillMany', splitTicks(gap).length);
}

/** Only the first or last bar can be a pickup, and only when it has notes and is not too long. */
export function canBePickup(song: Pick<Song, 'bars' | 'beats' | 'beatType'>, barIndex: number): boolean {
  const bar = song.bars[barIndex];
  if (!bar || (barIndex !== 0 && barIndex !== song.bars.length - 1)) return false;
  const ticks = barTicks(bar.events);
  return ticks > 0 && ticks < barCapacity(song);
}

/** The last note can absorb the gap when the new total is a real note length. */
export function canLengthenLast(bar: Bar, issue: BarIssue): boolean {
  const last = bar.events.at(-1);
  if (!last || issue.kind !== 'short') return false;
  return !!durationForTicks(eventTicks(last) + issue.capacity - issue.ticks);
}
