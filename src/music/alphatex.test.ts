import { describe, expect, it } from 'vitest';
import * as alphaTab from '@coderline/alphatab';
import { toAlphaTex, TRUMPET_PROGRAM } from './alphatex';
import { sampleSong, HOSTILE_TEXT } from '../../test/fixtures';
import type { Song } from '../model/types';

function load(song: Song) {
  return alphaTab.importer.ScoreLoader.loadAlphaTex(toAlphaTex(song));
}

/** MIDI note-on keys generated for a score, as the exporter (and the synth) would play them. */
function noteOnKeys(score: alphaTab.model.Score, applyInEvents: boolean): number[] {
  const midi = new alphaTab.midi.MidiFile();
  const gen = new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), new alphaTab.midi.AlphaSynthMidiFileHandler(midi));
  gen.applyTranspositionPitches = applyInEvents;
  gen.generate();
  const keys: number[] = [];
  for (const t of midi.tracks)
    for (const e of t.events)
      if (e instanceof alphaTab.midi.NoteOnEvent && e.noteVelocity > 0) {
        // In the live player the synth adds the channel transposition instead.
        keys.push(applyInEvents ? e.noteKey : e.noteKey + (gen.transpositionPitches.get(e.channel) ?? 0));
      }
  return keys;
}

const oneNote = (step: 'C' | 'G', octave: number): Song => ({
  ...sampleSong(),
  bars: [{ id: 'b', events: [{ id: 'n', rest: false, pitch: { step, alter: 0, octave }, duration: 'whole', dotted: false }] }],
});

describe('toAlphaTex', () => {
  it('produces the expected text for the sample song', () => {
    expect(toAlphaTex(sampleSong())).toMatchInlineSnapshot(`
      "\\title "Sample"
      \\tempo 100
      \\track "Trumpet in Bb" \\staff {score} \\instrument 56 \\transpose -2 \\displaytranspose 2 \\accidentals explicit
      .
      \\ts 4 4 \\ro \\section "A" :4 C4 D4{d} :8 Eb4 :4 r |
      \\ae 1 \\rc 2 :1 F#4 |
      \\ae 2 \\db :2 Bb4 :4 r :16 C5 r :8 r |"
    `);
  });

  it('plays written C4 as concert Bb3 (MIDI 58) but shows C4', () => {
    const score = load(oneNote('C', 4));
    const note = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
    expect(note.displayValue).toBe(60);
    expect(note.realValue).toBe(58);
    expect(noteOnKeys(score, true)).toEqual([58]);
    expect(noteOnKeys(score, false)).toEqual([58]);
    expect(score.tracks[0]!.playbackInfo.program).toBe(TRUMPET_PROGRAM);
  });

  it('is read back by alphaTab with repeats, voltas, markers, dots and accidentals', () => {
    const score = load(sampleSong());
    expect(score.title).toBe('Sample');
    expect(score.tempo).toBe(100);
    const mbs = score.masterBars;
    expect(mbs).toHaveLength(3);
    expect(mbs[0]!.isRepeatStart).toBe(true);
    expect(mbs[0]!.section?.text).toBe('A');
    expect(mbs[0]!.timeSignatureNumerator).toBe(4);
    expect(mbs[1]!.repeatCount).toBe(2);
    expect(mbs[1]!.alternateEndings).toBe(1);
    expect(mbs[2]!.alternateEndings).toBe(2);
    expect(mbs[2]!.isDoubleBar).toBe(true);
    const bars = score.tracks[0]!.staves[0]!.bars;
    const b0 = bars[0]!.voices[0]!.beats;
    expect(b0.map((b) => b.isRest)).toEqual([false, false, false, true]);
    expect(b0[1]!.dots).toBe(1);
    expect(b0[2]!.notes[0]!.displayValue).toBe(63);
    expect(b0[2]!.notes[0]!.accidentalMode).toBe(alphaTab.model.NoteAccidentalMode.ForceFlat);
    expect(bars[1]!.voices[0]!.beats[0]!.notes[0]!.accidentalMode).toBe(alphaTab.model.NoteAccidentalMode.ForceSharp);
    // one beat per event
    sampleSong().bars.forEach((bar, i) => expect(bars[i]!.voices[0]!.beats).toHaveLength(bar.events.length));
  });

  it('writes several volta numbers on one bar', () => {
    const s = sampleSong();
    s.bars[1]!.ending = [1, 2, 3];
    expect(load(s).masterBars[1]!.alternateEndings).toBe(0b111);
  });

  it('escapes hostile titles and markers', () => {
    const s = sampleSong();
    s.title = HOSTILE_TEXT;
    s.bars[0]!.marker = HOSTILE_TEXT;
    const score = load(s);
    const expected = HOSTILE_TEXT.replace(/[\u0000-\u001f]/g, ' ');
    expect(score.title).toBe(expected);
    expect(score.masterBars[0]!.section?.text).toBe(expected);
    expect(score.masterBars).toHaveLength(3);
  });

  it('pads empty bars with rests so alphaTab can lay them out', () => {
    const s = sampleSong();
    s.bars[1]!.events = [];
    const beats = load(s).tracks[0]!.staves[0]!.bars[1]!.voices[0]!.beats;
    expect(beats.every((b) => b.isRest)).toBe(true);
    expect(beats.length).toBeGreaterThan(0);
  });
});

describe('concertPitch', () => {
  it('spells a major 2nd down, keeping the written spelling recoverable', async () => {
    const { concertPitch } = await import('./alphatex');
    expect(concertPitch({ step: 'C', alter: 0, octave: 4 })).toEqual({ step: 'B', alter: -1, octave: 3 });
    expect(concertPitch({ step: 'F', alter: 1, octave: 4 })).toEqual({ step: 'E', alter: 0, octave: 4 });
    expect(concertPitch({ step: 'G', alter: -1, octave: 4 })).toEqual({ step: 'F', alter: -1, octave: 4 });
    expect(concertPitch({ step: 'C', alter: -1, octave: 5 })).toEqual({ step: 'A', alter: 0, octave: 4 }); // Bbb → A
  });
});
