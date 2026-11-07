import type { Alter, Pitch, Step } from '../model/types';
import { STEPS } from '../model/types';
import { formatNoteName, currentNaming } from '../i18n/noteNames';
import { t } from '../i18n';

const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Written pitch → MIDI key (C4 = 60). */
export function toMidi(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_SEMITONES[p.step] + p.alter;
}

/** B♭ trumpet sounds a major 2nd below the written note. */
export const TRUMPET_TRANSPOSE = -2;

export function soundingMidi(p: Pitch): number {
  return toMidi(p) + TRUMPET_TRANSPOSE;
}

/** Spell a MIDI key, preferring sharps or flats. */
export function fromMidi(midi: number, prefer: 'sharp' | 'flat' = 'sharp'): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const sharp: [Step, Alter][] = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
  const flat: [Step, Alter][] = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];
  const [step, alter] = (prefer === 'flat' ? flat : sharp)[pc]!;
  return { step, alter, octave };
}

/** Child-facing name in the chosen note naming, e.g. "B♭", "Si♭", "B" (German), "F♯". */
export function noteName(p: Pitch): string {
  return formatNoteName(p);
}

/** Spoken name for screen readers, e.g. "B flat 4", "Si bemolle 4", "Fis 4". */
export function spokenName(p: Pitch): string {
  if (currentNaming() === 'german') return `${formatNoteName(p)} ${p.octave}`;
  const base = formatNoteName({ step: p.step, alter: 0 });
  return `${base}${p.alter === 1 ? ` ${t('note.sharp')}` : p.alter === -1 ? ` ${t('note.flat')}` : ''} ${p.octave}`;
}

/** Move by diatonic steps (white-key letters), dropping the accidental. */
export function diatonicStep(p: Pitch, delta: number): Pitch {
  const idx = STEPS.indexOf(p.step) + p.octave * 7 + delta;
  const octave = Math.floor(idx / 7);
  const step = STEPS[((idx % 7) + 7) % 7]!;
  return { step, alter: 0, octave };
}

export function samePitch(a: Pitch | undefined, b: Pitch | undefined): boolean {
  return !!a && !!b && a.step === b.step && a.alter === b.alter && a.octave === b.octave;
}

export function isPitch(v: unknown): v is Pitch {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.step === 'string' &&
    (STEPS as readonly string[]).includes(o.step) &&
    (o.alter === -1 || o.alter === 0 || o.alter === 1) &&
    typeof o.octave === 'number' &&
    Number.isInteger(o.octave) &&
    o.octave >= 0 &&
    o.octave <= 9
  );
}
