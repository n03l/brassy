import type { Pitch } from '../model/types';
import { fromMidi, toMidi } from './pitch';
import { t } from '../i18n';

/** Valves pressed, e.g. [1, 3]; [] = open. */
export type Valves = readonly (1 | 2 | 3)[];

/** Written pitch (MIDI) → valves, B♭ trumpet, F♯3 … C6. The single source of the fingering chart. */
const TABLE: Record<number, Valves> = {
  54: [1, 2, 3], // F#3
  55: [1, 3], // G3
  56: [2, 3], // G#3
  57: [1, 2], // A3
  58: [1], // A#3/Bb3
  59: [2], // B3
  60: [], // C4
  61: [1, 2, 3], // C#4
  62: [1, 3], // D4
  63: [2, 3], // D#4/Eb4
  64: [1, 2], // E4
  65: [1], // F4
  66: [2], // F#4
  67: [], // G4
  68: [2, 3], // G#4
  69: [1, 2], // A4
  70: [1], // A#4/Bb4
  71: [2], // B4
  72: [], // C5
  73: [1, 2], // C#5
  74: [1], // D5
  75: [2], // D#5/Eb5
  76: [], // E5
  77: [1], // F5
  78: [2], // F#5
  79: [], // G5
  80: [2, 3], // G#5
  81: [1, 2], // A5
  82: [1], // A#5/Bb5
  83: [2], // B5
  84: [], // C6
};

export const EDIT_MIN_MIDI = 54;
export const EDIT_MAX_MIDI = 84;

export function fingeringForMidi(midi: number): Valves | undefined {
  return Object.prototype.hasOwnProperty.call(TABLE, midi) ? TABLE[midi] : undefined;
}

export function fingering(p: Pitch): Valves | undefined {
  return fingeringForMidi(toMidi(p));
}

export function inEditRange(p: Pitch): boolean {
  const m = toMidi(p);
  return m >= EDIT_MIN_MIDI && m <= EDIT_MAX_MIDI;
}

/** "Valve 1", "Valves 1 + 3", "No valves — open!" */
export function valveCaption(v: Valves | undefined): string {
  if (!v) return t('valves.outOfRange');
  if (v.length === 0) return t('valves.open');
  if (v.length === 1) return t('valves.one', v[0]!);
  return t('valves.many', v.join(' + '));
}

/** Notes for the fingering chart, low to high; sharps spelled as flats where players usually read them. */
export function chartNotes(): Pitch[] {
  const out: Pitch[] = [];
  for (let m = EDIT_MIN_MIDI; m <= EDIT_MAX_MIDI; m++) {
    const pc = m % 12;
    // F#, C#, G# as sharps; D#/A# as E♭/B♭.
    out.push(fromMidi(m, pc === 3 || pc === 10 ? 'flat' : 'sharp'));
  }
  return out;
}
