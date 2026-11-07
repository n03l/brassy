import { LIMITS } from './limits';
import { isValidId, newId } from './ids';
import type { Bar, Duration, NoteEvent, Pitch, Song } from './types';
import { DURATIONS } from './types';
import { isPitch, toMidi } from '../music/pitch';
import { barCapacity, durationForTicks, splitTicks } from '../music/duration';
import { t } from '../i18n';

export class SongFormatError extends Error {}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Trim, drop control characters and cap the length. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return Array.from(v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
}

/** Any parseable date → ISO UTC; otherwise `fallback`. */
export function toIsoDate(v: unknown, fallback: string): string {
  if (typeof v !== 'string' && typeof v !== 'number') return fallback;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type NormalizeResult = { song: Song; repairs: string[] };

/**
 * Turn anything that looks like a song into a valid Song, repairing what can be repaired.
 * Used when loading from IndexedDB, restoring backups and merging, so stored data always loads.
 * Throws SongFormatError only when there is nothing usable.
 */
export function normalizeSong(raw: unknown, now = new Date().toISOString()): NormalizeResult {
  if (!isRecord(raw)) throw new SongFormatError('Not a song');
  const repairs: string[] = [];
  const note = (msg: string) => {
    if (!repairs.includes(msg)) repairs.push(msg);
  };

  const id = isValidId(raw.id) ? raw.id : (note('new song id'), newId());
  let title = cleanText(raw.title, LIMITS.titleMaxChars);
  if (!title) {
    title = t('song.untitled');
    note('empty title');
  }
  const tempo = clampInt(raw.tempo, LIMITS.tempoMin, LIMITS.tempoMax, 100);
  const beats = clampInt(raw.beats, LIMITS.beatsMin, LIMITS.beatsMax, 4);
  const beatType = typeof raw.beatType === 'number' && LIMITS.beatTypes.includes(raw.beatType) ? raw.beatType : 4;
  if (tempo !== raw.tempo || beats !== raw.beats || beatType !== raw.beatType) note('tempo or time signature fixed');

  if (!Array.isArray(raw.bars)) throw new SongFormatError('Song has no bars');
  let rawBars: unknown[] = raw.bars;
  if (rawBars.length > LIMITS.barsMax) {
    note(`only the first ${LIMITS.barsMax} bars kept`);
    rawBars = rawBars.slice(0, LIMITS.barsMax);
  }

  const seen = new Set<string>([id]);
  const uniqueId = (v: unknown): string => {
    if (isValidId(v) && !seen.has(v)) {
      seen.add(v);
      return v;
    }
    note('duplicate or missing ids replaced');
    let n = newId();
    while (seen.has(n)) n = newId();
    seen.add(n);
    return n;
  };

  const bars: Bar[] = [];
  for (const rb of rawBars) {
    if (!isRecord(rb)) {
      note('broken bar skipped');
      continue;
    }
    const bar: Bar = { id: uniqueId(rb.id), events: [] };
    let rawEvents: unknown[] = Array.isArray(rb.events) ? rb.events : [];
    if (rawEvents.length > LIMITS.eventsPerBarMax) {
      note('very long bar shortened');
      rawEvents = rawEvents.slice(0, LIMITS.eventsPerBarMax);
    }
    for (const re of rawEvents) {
      if (!isRecord(re)) {
        note('broken note skipped');
        continue;
      }
      const duration: Duration = (DURATIONS as readonly unknown[]).includes(re.duration)
        ? (re.duration as Duration)
        : (note('unknown note length set to quarter'), 'quarter');
      const dotted = re.dotted === true;
      let rest = re.rest === true;
      let pitch: Pitch | undefined;
      if (!rest) {
        if (isPitch(re.pitch)) {
          const m = toMidi(re.pitch);
          if (m < LIMITS.storedMidiMin || m > LIMITS.storedMidiMax) {
            note('notes out of range turned into rests');
            rest = true;
          } else pitch = { step: re.pitch.step, alter: re.pitch.alter, octave: re.pitch.octave };
        } else {
          note('notes without a pitch turned into rests');
          rest = true;
        }
      }
      const ev: NoteEvent = { id: uniqueId(re.id), rest, duration, dotted };
      if (pitch) ev.pitch = pitch;
      if (re.tie === true) ev.tie = true;
      bar.events.push(ev);
    }
    if (rb.repeatOpen === true) bar.repeatOpen = true;
    if (rb.repeatClose !== undefined && rb.repeatClose !== null && rb.repeatClose !== 0) {
      bar.repeatClose = clampInt(rb.repeatClose, LIMITS.repeatTimesMin, LIMITS.repeatTimesMax, 2);
    }
    if (Array.isArray(rb.ending)) {
      const nums = [...new Set(rb.ending.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= LIMITS.endingMax))]
        .sort((a, b) => a - b)
        .slice(0, LIMITS.endingsPerBarMax);
      if (nums.length) bar.ending = nums;
    }
    const marker = cleanText(rb.marker, LIMITS.markerMaxChars);
    if (marker) bar.marker = marker;
    if (rb.doubleBar === true) bar.doubleBar = true;
    if (rb.pickup === true) bar.pickup = true;
    bars.push(bar);
  }
  if (bars.length === 0) {
    note('empty song given one bar');
    bars.push(emptyBar({ beats, beatType }));
  }

  const tied = cleanTies(bars);
  if (tied.removed) note('broken ties removed');
  bars.splice(0, bars.length, ...tied.bars);

  const createdAt = toIsoDate(raw.createdAt, now);
  const updatedAt = toIsoDate(raw.updatedAt, createdAt);
  return { song: { id, title, tempo, beats, beatType, bars, createdAt, updatedAt }, repairs };
}

/**
 * Keep a tie only where it can hold: on a note whose previous event (earlier in the bar, or the last event of the
 * bar before; an empty bar breaks it) is a note of the same MIDI pitch. The tied note takes the spelling of the
 * note it continues. Returns the same bar objects when nothing changed.
 */
export function cleanTies(bars: Bar[]): { bars: Bar[]; removed: boolean } {
  let removed = false;
  let prev: NoteEvent | undefined;
  const out = bars.map((bar) => {
    let events: NoteEvent[] | undefined;
    bar.events.forEach((e, i) => {
      let fixed = e;
      if ('tie' in e) {
        const origin = prev && !prev.rest && prev.pitch ? prev.pitch : undefined;
        const ok = e.tie === true && !e.rest && !!e.pitch && !!origin && toMidi(origin) === toMidi(e.pitch);
        if (!ok) {
          fixed = { ...e };
          delete fixed.tie;
          removed = true;
        } else if (!samePitch(origin!, e.pitch!)) {
          fixed = { ...e, pitch: { ...origin! } };
        }
      }
      if (fixed !== e) {
        events ??= bar.events.slice();
        events[i] = fixed;
      }
      prev = fixed;
    });
    if (bar.events.length === 0) prev = undefined;
    return events ? { ...bar, events } : bar;
  });
  return { bars: out, removed };
}

function samePitch(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && a.alter === b.alter && a.octave === b.octave;
}

/** cleanTies for a whole song; the same object when nothing changed. */
export function cleanSongTies(song: Song): Song {
  const { bars } = cleanTies(song.bars);
  return bars.every((b, i) => b === song.bars[i]) ? song : { ...song, bars };
}

/** A bar filled with rests for the time signature (whole rest when it fits exactly). */
export function emptyBar(sig: Pick<Song, 'beats' | 'beatType'>): Bar {
  return { id: newId(), events: restsForTicks(barCapacity(sig)) };
}

/** Rests that fill `ticks`: one (dotted) rest when one fits exactly, otherwise the fewest plain rests. */
export function restsForTicks(ticks: number): NoteEvent[] {
  const one = durationForTicks(ticks);
  if (one) return [{ id: newId(), rest: true, duration: one.duration, dotted: one.dotted }];
  return splitTicks(ticks).map((d) => ({ id: newId(), rest: true, duration: d, dotted: false }));
}

/** Strict check used before every write: the song must already be in canonical form. */
export function assertCanonical(song: Song): void {
  const { song: n } = normalizeSong(song, song.updatedAt);
  if (stableStringify(n) !== stableStringify(song)) {
    throw new SongFormatError('Song is not in canonical form');
  }
}

/** JSON with sorted keys, so key order doesn't matter when comparing or hashing. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}
