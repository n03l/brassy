import type { Pitch, Song } from '../model/types';
import type { EventRef } from '../player/ScoreController';

export type SeqNote = { ref: EventRef; pitch: Pitch; id: string };

/** All notes (not rests) in score order. */
export function notesInOrder(song: Song): SeqNote[] {
  const out: SeqNote[] = [];
  song.bars.forEach((bar, b) =>
    bar.events.forEach((e, i) => {
      // A tied note is held on from the one before, not played again.
      if (!e.rest && e.pitch && !e.tie) out.push({ ref: { bar: b, event: i }, pitch: e.pitch, id: e.id });
    }),
  );
  return out;
}

export function compareRef(a: EventRef, b: EventRef): number {
  return a.bar - b.bar || a.event - b.event;
}

/** The note sounding at `ref` (or the next one when `ref` is a rest), and the notes after it. */
export function nowAndNext(seq: SeqNote[], ref: EventRef | null, count = 4, held = false): { now: SeqNote | undefined; next: SeqNote[] } {
  if (!seq.length) return { now: undefined, next: [] };
  let i = ref ? seq.findIndex((n) => compareRef(n.ref, ref) >= 0) : 0;
  // `held`: `ref` is a tied note, so the note still sounding is the last one that started before it.
  if (ref && held) {
    const before = (i < 0 ? seq.length : i) - 1;
    if (before >= 0) i = before;
  }
  if (i < 0) return { now: undefined, next: [] };
  const now = seq[i]!;
  return { now, next: seq.slice(i + 1, i + 1 + count) };
}
