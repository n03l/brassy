import { describe, expect, it } from 'vitest';
import { chartNotes, fingering, fingeringForMidi, inEditRange, valveCaption } from './fingering';
import type { Pitch } from '../model/types';

const p = (step: Pitch['step'], alter: Pitch['alter'], octave: number): Pitch => ({ step, alter, octave });

describe('fingering table', () => {
  it('matches the reference chart', () => {
    const expected: [Pitch, number[]][] = [
      [p('F', 1, 3), [1, 2, 3]], [p('G', 0, 3), [1, 3]], [p('G', 1, 3), [2, 3]], [p('A', 0, 3), [1, 2]],
      [p('B', -1, 3), [1]], [p('A', 1, 3), [1]], [p('B', 0, 3), [2]], [p('C', 0, 4), []],
      [p('C', 1, 4), [1, 2, 3]], [p('D', 0, 4), [1, 3]], [p('E', -1, 4), [2, 3]], [p('D', 1, 4), [2, 3]],
      [p('E', 0, 4), [1, 2]], [p('F', 0, 4), [1]], [p('F', 1, 4), [2]], [p('G', 0, 4), []],
      [p('G', 1, 4), [2, 3]], [p('A', 0, 4), [1, 2]], [p('B', -1, 4), [1]], [p('B', 0, 4), [2]],
      [p('C', 0, 5), []], [p('C', 1, 5), [1, 2]], [p('D', 0, 5), [1]], [p('E', -1, 5), [2]],
      [p('E', 0, 5), []], [p('F', 0, 5), [1]], [p('F', 1, 5), [2]], [p('G', 0, 5), []],
      [p('G', 1, 5), [2, 3]], [p('A', 0, 5), [1, 2]], [p('B', -1, 5), [1]], [p('B', 0, 5), [2]],
      [p('C', 0, 6), []],
    ];
    for (const [pitch, valves] of expected) expect(fingering(pitch), JSON.stringify(pitch)).toEqual(valves);
  });

  it('covers every semitone from F#3 to C6 and nothing outside', () => {
    for (let m = 54; m <= 84; m++) expect(fingeringForMidi(m)).toBeDefined();
    expect(fingeringForMidi(53)).toBeUndefined();
    expect(fingeringForMidi(85)).toBeUndefined();
    expect(inEditRange(p('F', 0, 3))).toBe(false);
    expect(inEditRange(p('C', 0, 6))).toBe(true);
  });

  it('ignores prototype keys', () => {
    expect(fingeringForMidi(Number('constructor'))).toBeUndefined();
  });

  it('writes friendly captions', () => {
    expect(valveCaption([])).toBe('No valves — open!');
    expect(valveCaption([1])).toBe('Valve 1');
    expect(valveCaption([1, 3])).toBe('Valves 1 + 3');
  });

  it('lists 31 chart notes from low F# to high C', () => {
    const notes = chartNotes();
    expect(notes).toHaveLength(31);
    expect(notes[0]).toEqual(p('F', 1, 3));
    expect(notes.at(-1)).toEqual(p('C', 0, 6));
    expect(notes.some((n) => n.step === 'B' && n.alter === -1)).toBe(true);
  });
});
