import { describe, expect, it } from 'vitest';
import { diatonicStep, fromMidi, noteName, soundingMidi, toMidi } from './pitch';

describe('pitch', () => {
  it('maps written pitch to MIDI and sounding pitch', () => {
    expect(toMidi({ step: 'C', alter: 0, octave: 4 })).toBe(60);
    expect(soundingMidi({ step: 'C', alter: 0, octave: 4 })).toBe(58);
    expect(toMidi({ step: 'B', alter: -1, octave: 3 })).toBe(58);
  });
  it('round-trips MIDI spelling', () => {
    for (let m = 40; m < 90; m++) {
      expect(toMidi(fromMidi(m))).toBe(m);
      expect(toMidi(fromMidi(m, 'flat'))).toBe(m);
    }
  });
  it('moves by diatonic steps across octaves', () => {
    expect(diatonicStep({ step: 'B', alter: -1, octave: 4 }, 1)).toEqual({ step: 'C', alter: 0, octave: 5 });
    expect(diatonicStep({ step: 'C', alter: 0, octave: 4 }, -1)).toEqual({ step: 'B', alter: 0, octave: 3 });
  });
  it('names notes for children', () => {
    expect(noteName({ step: 'B', alter: -1, octave: 4 })).toBe('B♭');
    expect(noteName({ step: 'F', alter: 1, octave: 4 })).toBe('F♯');
  });
});
