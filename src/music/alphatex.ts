import type { Bar, NoteEvent, Song } from '../model/types';
import { fromMidi, toMidi, TRUMPET_TRANSPOSE } from './pitch';
import type { Pitch } from '../model/types';
import { STEPS } from '../model/types';
import { barCapacity, denominator, splitTicks } from './duration';

/** General MIDI trumpet, zero-based. */
export const TRUMPET_PROGRAM = 56;

/** Quote a string for alphaTex: drop control characters, escape backslash and quote. */
export function texString(s: string): string {
  const clean = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');
  return '"' + clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Concert pitch of a written B♭-trumpet note, spelled a major 2nd lower (C→B♭, F♯→E, G♭→F♭…) so the written
 * spelling survives when it is shown again with the display transposition.
 */
export function concertPitch(p: Pitch): Pitch {
  const idx = STEPS.indexOf(p.step);
  const step = STEPS[(idx + 6) % 7]!;
  const octave = idx === 0 ? p.octave - 1 : p.octave;
  const target = toMidi(p) + TRUMPET_TRANSPOSE;
  const alter = target - toMidi({ step, alter: 0, octave });
  if (alter >= -1 && alter <= 1) return { step, alter: alter as Pitch['alter'], octave };
  return fromMidi(target, 'flat');
}

function pitchTex(e: Pick<NoteEvent, 'rest' | 'pitch'>, concert: boolean): string {
  if (e.rest || !e.pitch) return 'r';
  const p = concert ? concertPitch(e.pitch) : e.pitch;
  const acc = p.alter === 1 ? '#' : p.alter === -1 ? 'b' : '';
  return `${p.step}${acc}${p.octave}`;
}

export type AlphaTexOptions = {
  /**
   * Write notes at concert pitch with only a display transposition (the form alphaTab's MusicXML importer uses).
   * Needed for exporters that ignore the staff's playback transposition (Guitar Pro).
   */
  concertNotes?: boolean;
};

/**
 * alphaTex for one trumpet staff. Pitches are written pitch: `\transpose -2` makes playback sound a major 2nd
 * lower, and `\displaytranspose 2` cancels that shift for the notation, so the staff shows what the player reads.
 * Each NoteEvent becomes exactly one beat, in order, so alphaTab beat (bar i, beat j) is song.bars[i].events[j].
 * Empty bars are filled with rests so alphaTab can lay them out (those beats map to no event).
 */
export function toAlphaTex(song: Song, opts: AlphaTexOptions = {}): string {
  const out: string[] = [];
  out.push(`\\title ${texString(song.title)}`);
  out.push(`\\tempo ${Math.round(song.tempo)}`);
  out.push(
    `\\track "Trumpet in Bb" \\staff {score} \\instrument ${TRUMPET_PROGRAM} ` +
      (opts.concertNotes ? '' : `\\transpose ${TRUMPET_TRANSPOSE} `) +
      `\\displaytranspose ${-TRUMPET_TRANSPOSE} \\accidentals explicit`,
  );
  out.push('.');
  song.bars.forEach((bar, i) => out.push(barTex(song, bar, i, !!opts.concertNotes) + ' |'));
  return out.join('\n');
}

function barTex(song: Song, bar: Bar, index: number, concert: boolean): string {
  const parts: string[] = [];
  if (index === 0) parts.push(`\\ts ${song.beats} ${song.beatType}`);
  if (bar.pickup) parts.push('\\ac');
  // alphaTab leaves pickup bars unnumbered; keep its numbers equal to ours (bar i is "bar i+1" everywhere).
  else if (song.bars[index - 1]?.pickup) parts.push(`\\barnumber ${index + 1}`);
  if (bar.repeatOpen) parts.push('\\ro');
  if (bar.ending?.length) parts.push(bar.ending.length === 1 ? `\\ae ${bar.ending[0]}` : `\\ae (${bar.ending.join(' ')})`);
  if (bar.repeatClose) parts.push(`\\rc ${bar.repeatClose}`);
  if (bar.marker) parts.push(`\\section ${texString(bar.marker)}`);
  if (bar.doubleBar) parts.push('\\db');

  const events: Pick<NoteEvent, 'rest' | 'pitch' | 'duration' | 'dotted' | 'tie'>[] = bar.events.length
    ? bar.events
    : splitTicks(barCapacity(song)).map((d) => ({ rest: true, duration: d, dotted: false }));
  let current = 0;
  for (const e of events) {
    const den = denominator(e.duration);
    if (den !== current) {
      parts.push(`:${den}`);
      current = den;
    }
    const props = [e.tie && !e.rest ? 't' : '', e.dotted ? 'd' : ''].filter(Boolean).join(' ');
    parts.push(pitchTex(e, concert) + (props ? `{${props}}` : ''));
  }
  return parts.join(' ');
}

/** True when the bar was padded with rests in the alphaTex (no events to map to). */
export function isPaddedBar(bar: Bar): boolean {
  return bar.events.length === 0;
}

