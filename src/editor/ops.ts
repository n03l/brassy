import type { Alter, Bar, Duration, NoteEvent, Pitch, Song } from '../model/types';
import { newId } from '../model/ids';
import { restsForTicks } from '../model/normalize';
import { LIMITS } from '../model/limits';
import { barCapacity, barTicks, durationForTicks, eventTicks } from '../music/duration';
import { diatonicStep, toMidi } from '../music/pitch';
import { EDIT_MAX_MIDI, EDIT_MIN_MIDI } from '../music/fingering';
import type { EventRef } from '../player/ScoreController';

/** Pure edits: each returns a new song (or the same object when nothing changed) and the new selection. */
export type EditResult = { song: Song; sel: EventRef | null };

const DEFAULT_PITCH: Pitch = { step: 'C', alter: 0, octave: 5 };

function inRange(p: Pitch) {
  const m = toMidi(p);
  return m >= EDIT_MIN_MIDI && m <= EDIT_MAX_MIDI;
}

function updateBar(song: Song, index: number, fn: (b: Bar) => Bar): Song {
  const bars = song.bars.slice();
  bars[index] = fn(bars[index]!);
  return { ...song, bars };
}

function updateEvent(song: Song, ref: EventRef, fn: (e: NoteEvent) => NoteEvent | null): Song {
  const e = song.bars[ref.bar]?.events[ref.event];
  if (!e) return song;
  const next = fn(e);
  if (next === e || next === null) return song;
  return updateBar(song, ref.bar, (b) => {
    const events = b.events.slice();
    events[ref.event] = next;
    return { ...b, events };
  });
}

export function eventAt(song: Song, ref: EventRef | null): NoteEvent | undefined {
  return ref ? song.bars[ref.bar]?.events[ref.event] : undefined;
}

/** A pitch to give a rest that becomes a note: the nearest earlier note, or C5. */
export function nearbyPitch(song: Song, ref: EventRef): Pitch {
  for (let b = ref.bar; b >= 0; b--) {
    const evs = song.bars[b]!.events;
    for (let i = b === ref.bar ? ref.event - 1 : evs.length - 1; i >= 0; i--) {
      const p = evs[i]!.pitch;
      if (!evs[i]!.rest && p) return p;
    }
  }
  return DEFAULT_PITCH;
}

/** Higher / Lower: one letter step, within the editing range. */
export function stepPitch(song: Song, ref: EventRef, delta: 1 | -1): Song {
  return updateEvent(song, ref, (e) => {
    if (e.rest || !e.pitch) return e;
    const p = diatonicStep(e.pitch, delta);
    return inRange(p) ? { ...e, pitch: p } : e;
  });
}

/** ♯ ♭ ♮ — pressing the active sign again turns it back to natural. */
export function setAlter(song: Song, ref: EventRef, alter: Alter): Song {
  return updateEvent(song, ref, (e) => {
    if (e.rest || !e.pitch) return e;
    const a: Alter = e.pitch.alter === alter && alter !== 0 ? 0 : alter;
    const p = { ...e.pitch, alter: a };
    return inRange(p) && a !== e.pitch.alter ? { ...e, pitch: p } : e;
  });
}

export function setDuration(song: Song, ref: EventRef, duration: Duration): Song {
  return updateEvent(song, ref, (e) => (e.duration === duration ? e : { ...e, duration }));
}

export function toggleDot(song: Song, ref: EventRef): Song {
  return updateEvent(song, ref, (e) => ({ ...e, dotted: !e.dotted }));
}

export function toggleRest(song: Song, ref: EventRef): Song {
  return updateEvent(song, ref, (e) => {
    if (e.rest) return { id: e.id, rest: false, pitch: nearbyPitch(song, ref), duration: e.duration, dotted: e.dotted };
    return { id: e.id, rest: true, duration: e.duration, dotted: e.dotted };
  });
}

/** Mark a bar as a pickup (allowed to be short), or back to a normal bar. */
export function togglePickup(song: Song, barIndex: number): Song {
  if (!song.bars[barIndex]) return song;
  return updateBar(song, barIndex, (b) => {
    const next = { ...b };
    if (b.pickup) delete next.pickup;
    else next.pickup = true;
    return next;
  });
}

/** The event just before `ref` in score order (an empty bar in between counts as a break). */
function previousEvent(song: Song, ref: EventRef): NoteEvent | undefined {
  if (ref.event > 0) return song.bars[ref.bar]?.events[ref.event - 1];
  const prev = song.bars[ref.bar - 1]?.events;
  return prev?.[prev.length - 1];
}

/** A note can be tied when the event before it is a note too. */
export function canTie(song: Song, ref: EventRef | null): boolean {
  if (!ref) return false;
  const e = eventAt(song, ref);
  const p = previousEvent(song, ref);
  return !!e && !e.rest && !!e.pitch && !!p && !p.rest && !!p.pitch;
}

/** Tie the note to the one before (taking its pitch so the tie holds), or untie it. */
export function toggleTie(song: Song, ref: EventRef): Song {
  if (!canTie(song, ref)) return song;
  const origin = previousEvent(song, ref)!.pitch!;
  return updateEvent(song, ref, (e) => {
    if (e.tie) {
      const next = { ...e };
      delete next.tie;
      return next;
    }
    return { ...e, pitch: { ...origin }, tie: true };
  });
}

/** Insert a copy of the selected note after it, and select the new one. */
export function insertAfter(song: Song, ref: EventRef): EditResult {
  const bar = song.bars[ref.bar];
  const e = bar?.events[ref.event];
  if (!bar || !e || bar.events.length >= LIMITS.eventsPerBarMax) return { song, sel: ref };
  const copy: NoteEvent = { ...e, id: newId(), ...(e.pitch ? { pitch: { ...e.pitch } } : {}) };
  delete copy.tie;
  const next = updateBar(song, ref.bar, (b) => {
    const events = b.events.slice();
    events.splice(ref.event + 1, 0, copy);
    return { ...b, events };
  });
  return { song: next, sel: { bar: ref.bar, event: ref.event + 1 } };
}

/** Delete the note; the selection moves to its neighbour (or stays on the empty bar). */
export function deleteEvent(song: Song, ref: EventRef): EditResult {
  const bar = song.bars[ref.bar];
  if (!bar?.events[ref.event]) return { song, sel: ref };
  const next = updateBar(song, ref.bar, (b) => ({ ...b, events: b.events.filter((_, i) => i !== ref.event) }));
  const left = next.bars[ref.bar]!.events.length;
  if (left > 0) return { song: next, sel: { bar: ref.bar, event: Math.min(ref.event, left - 1) } };
  return { song: next, sel: moveSelection(next, ref, -1) ?? moveSelection(next, ref, 1) };
}

/** Next/previous event across bars (skipping empty bars). */
export function moveSelection(song: Song, ref: EventRef | null, delta: 1 | -1): EventRef | null {
  const flat: EventRef[] = [];
  song.bars.forEach((b, bi) => b.events.forEach((_, ei) => flat.push({ bar: bi, event: ei })));
  if (!flat.length) return null;
  if (!ref) return flat[0]!;
  let i = flat.findIndex((r) => r.bar === ref.bar && r.event === ref.event);
  if (i < 0) {
    // ref points into an empty bar: find the nearest event in the direction of travel
    i = delta > 0 ? flat.findIndex((r) => r.bar > ref.bar) : flat.map((r) => r.bar < ref.bar).lastIndexOf(true);
    return i < 0 ? null : flat[i]!;
  }
  return flat[Math.max(0, Math.min(flat.length - 1, i + delta))]!;
}

/* ---------- bar fixes ---------- */

export function fillWithRests(song: Song, barIndex: number): Song {
  const bar = song.bars[barIndex];
  if (!bar) return song;
  const gap = barCapacity(song) - barTicks(bar.events);
  if (gap <= 0) return song;
  const rests = restsForTicks(gap);
  if (bar.events.length + rests.length > LIMITS.eventsPerBarMax) return song;
  return updateBar(song, barIndex, (b) => ({ ...b, events: [...b.events, ...rests] }));
}

export function lengthenLast(song: Song, barIndex: number): Song {
  const bar = song.bars[barIndex];
  const last = bar?.events.at(-1);
  if (!bar || !last) return song;
  const gap = barCapacity(song) - barTicks(bar.events);
  const d = gap > 0 ? durationForTicks(eventTicks(last) + gap) : undefined;
  if (!d) return song;
  return updateEvent(song, { bar: barIndex, event: bar.events.length - 1 }, (e) => ({ ...e, ...d }));
}

/** Move the notes that don't fit to the start of the next bar (a new bar is added at the end if needed). */
export function moveExtraToNext(song: Song, barIndex: number): Song {
  const bar = song.bars[barIndex];
  if (!bar) return song;
  const cap = barCapacity(song);
  let t = 0;
  let cut = bar.events.length;
  for (let i = 0; i < bar.events.length; i++) {
    t += eventTicks(bar.events[i]!);
    if (t > cap) {
      cut = i;
      break;
    }
  }
  if (cut === 0) cut = 1; // a single note longer than the bar stays
  if (cut >= bar.events.length) return song;
  const extra = bar.events.slice(cut);
  const bars = song.bars.slice();
  bars[barIndex] = { ...bar, events: bar.events.slice(0, cut) };
  const nextBar = bars[barIndex + 1];
  if (nextBar) {
    if (nextBar.events.length + extra.length > LIMITS.eventsPerBarMax) return song;
    // A whole-bar rest in the next bar gets replaced rather than pushed along.
    const keep = nextBar.events.length === 1 && nextBar.events[0]!.rest && barTicks(nextBar.events) === cap ? [] : nextBar.events;
    bars[barIndex + 1] = { ...nextBar, events: [...extra, ...keep] };
  } else {
    if (bars.length >= LIMITS.barsMax) return song;
    bars.push({ id: newId(), events: extra });
  }
  return { ...song, bars };
}

/** Add an empty (rest-filled) bar at the end. */
export function addBar(song: Song): Song {
  if (song.bars.length >= LIMITS.barsMax) return song;
  return { ...song, bars: [...song.bars, { id: newId(), events: restsForTicks(barCapacity(song)) }] };
}

export { DEFAULT_PITCH };

export const TEMPO_STEP = 5;

/** The song's own tempo (♩ per minute), within the limits. */
export function setTempo(song: Song, tempo: number): Song {
  const v = Math.min(LIMITS.tempoMax, Math.max(LIMITS.tempoMin, Math.round(tempo)));
  return v === song.tempo ? song : { ...song, tempo: v };
}

/** Step to the next multiple of 5 (so 97 → 100 / 95), within the limits. */
export function stepTempo(song: Song, dir: 1 | -1): Song {
  const next = dir > 0 ? Math.floor(song.tempo / TEMPO_STEP) * TEMPO_STEP + TEMPO_STEP : Math.ceil(song.tempo / TEMPO_STEP) * TEMPO_STEP - TEMPO_STEP;
  return setTempo(song, next);
}
